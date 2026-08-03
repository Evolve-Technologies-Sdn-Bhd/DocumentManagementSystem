const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const auditLogService = require('../services/auditLogService');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const divisionScopeService = require('../services/divisionScopeService')

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'Password123!';

class UsersController {
  /**
   * Get all users
   * GET /api/users
   */
  getAllUsers = asyncHandler(async (req, res) => {
    const divisionIdRaw = req.query?.divisionId
    const documentIdRaw = req.query?.documentId
    const roleNameRaw = req.query?.roleName ?? req.query?.role

    const requesterIsAdmin = divisionScopeService.isAdminUser(req.user)
    const requesterDivisionIds = requesterIsAdmin ? null : divisionScopeService.normalizeDivisionIds(req.user?.divisionIds || [])

    let targetDivisionIds = null
    const roleName = roleNameRaw !== undefined && roleNameRaw !== null && String(roleNameRaw).trim() !== ''
      ? String(roleNameRaw).trim().toLowerCase()
      : null

    if (documentIdRaw) {
      const documentId = Number.parseInt(documentIdRaw, 10)
      if (Number.isFinite(documentId)) {
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { id: true, folderId: true, divisionId: true }
        })

        if (doc?.folderId) {
          targetDivisionIds = await divisionScopeService.getEffectiveFolderDivisionIds(doc.folderId)
        } else if (doc?.divisionId) {
          targetDivisionIds = [doc.divisionId]
        } else {
          targetDivisionIds = []
        }
      }
    } else if (divisionIdRaw !== undefined) {
      const divisionId = Number.parseInt(divisionIdRaw, 10)
      targetDivisionIds = Number.isFinite(divisionId) ? [divisionId] : []
    }

    if (!requesterIsAdmin) {
      if (!requesterDivisionIds || requesterDivisionIds.length === 0) {
        return ResponseFormatter.success(res, { users: [] }, 'Users retrieved successfully')
      }
      if (!targetDivisionIds) {
        targetDivisionIds = requesterDivisionIds
      } else {
        const allowed = new Set(requesterDivisionIds)
        targetDivisionIds = targetDivisionIds.filter((id) => allowed.has(id))
      }
    }

    if (Array.isArray(targetDivisionIds) && targetDivisionIds.length === 0) {
      return ResponseFormatter.success(res, { users: [] }, 'Users retrieved successfully')
    }

    const where = Array.isArray(targetDivisionIds)
      ? {
          divisions: { some: { divisionId: { in: targetDivisionIds } } },
          ...(roleName
            ? { roles: { some: { role: { name: roleName } } } }
            : {})
        }
      : roleName
        ? { roles: { some: { role: { name: roleName } } } }
      : undefined

    const users = await prisma.user.findMany({
      where,
      include: {
        roles: {
          include: {
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Remove passwords from response
    const usersWithoutPassword = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    return ResponseFormatter.success(
      res,
      { users: usersWithoutPassword },
      'Users retrieved successfully'
    );
  });

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  getUserById = asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true
          }
        },
        preferences: true
      }
    });

    if (!user) {
      return ResponseFormatter.error(res, 'User not found', 404);
    }

    const { password, ...userWithoutPassword } = user;

    return ResponseFormatter.success(
      res,
      { user: userWithoutPassword },
      'User retrieved successfully'
    );
  });

  /**
   * Create new user
   * POST /api/users
   */
  createUser = asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, department, position, roleIds, divisionIds } = req.body;

    // Validation - email and firstName are required, lastName is optional
    if (!email || !firstName) {
      return ResponseFormatter.error(res, 'Missing required fields: email and firstName are required', 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail) {
      return ResponseFormatter.error(res, 'Missing required fields: email and firstName are required', 400);
    }

    const userPassword = password || DEFAULT_PASSWORD

    const requesterIsAdmin = divisionScopeService.isAdminUser(req.user)
    const requesterDivisionIds = requesterIsAdmin ? null : divisionScopeService.normalizeDivisionIds(req.user?.divisionIds || [])

    const normalizedDivisionIds = Array.isArray(divisionIds)
      ? [...new Set(divisionIds.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isFinite(v)))]
      : []

    if (normalizedDivisionIds.length === 0) {
      return ResponseFormatter.error(res, 'Missing required fields: divisionIds must be a non-empty array', 400)
    }

    if (!requesterIsAdmin) {
      if (!requesterDivisionIds || requesterDivisionIds.length === 0) {
        return ResponseFormatter.error(res, 'You do not have any division assigned. Please contact the system administrator.', 403)
      }
      const allowed = new Set(requesterDivisionIds)
      const outOfScope = normalizedDivisionIds.some((id) => !allowed.has(id))
      if (outOfScope) {
        return ResponseFormatter.error(res, 'You can only assign users to divisions within your scope', 403)
      }
    }

    const activeDivisions = await prisma.division.findMany({
      where: {
        id: { in: normalizedDivisionIds },
        isActive: true
      },
      select: { id: true }
    })
    const activeDivisionSet = new Set(activeDivisions.map((d) => d.id))
    const invalidDivisionIds = normalizedDivisionIds.filter((id) => !activeDivisionSet.has(id))
    if (invalidDivisionIds.length > 0) {
      return ResponseFormatter.error(res, `Invalid or inactive divisionIds: ${invalidDivisionIds.join(', ')}`, 400)
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return ResponseFormatter.error(res, 'User with this email already exists', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userPassword, 10);

    const latest = await prisma.user.findFirst({
      where: {
        employeeId: {
          startsWith: 'EMP'
        }
      },
      orderBy: {
        employeeId: 'desc'
      },
      select: {
        employeeId: true
      }
    })

    const latestEmployeeId = latest?.employeeId || null
    const latestNumber = latestEmployeeId && /^EMP\d{5}$/.test(latestEmployeeId)
      ? parseInt(latestEmployeeId.slice(3), 10)
      : 0

    let user = null
    let lastCreateError = null
    for (let attempt = 1; attempt <= 25; attempt++) {
      const generatedEmployeeId = `EMP${String(latestNumber + attempt).padStart(5, '0')}`
      try {
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            firstName,
            lastName,
            phone,
            department,
            position,
            employeeId: generatedEmployeeId,
            status: 'ACTIVE'
          }
        })
        lastCreateError = null
        break
      } catch (e) {
        lastCreateError = e
        if (e?.code === 'P2002') {
          const target = e?.meta?.target
          const fields = Array.isArray(target) ? target : []
          if (fields.includes('email')) {
            return ResponseFormatter.error(res, 'User with this email already exists', 409)
          }
          if (fields.includes('employeeId')) {
            continue
          }
          continue
        }
        throw e
      }
    }

    if (!user && lastCreateError) {
      if (lastCreateError?.code === 'P2002') {
        const target = lastCreateError?.meta?.target
        const fields = Array.isArray(target) ? target : []
        if (fields.includes('email')) {
          return ResponseFormatter.error(res, 'User with this email already exists', 409)
        }
        if (fields.includes('employeeId')) {
          return ResponseFormatter.error(res, 'Failed to create user due to employee ID collision. Please try again.', 409)
        }
      }
      throw lastCreateError
    }

    // Assign roles if provided
    if (roleIds && Array.isArray(roleIds) && roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: roleIds.map(roleId => ({
          userId: user.id,
          roleId: parseInt(roleId)
        }))
      });
    }

    await prisma.userDivision.createMany({
      data: normalizedDivisionIds.map((divisionId) => ({
        userId: user.id,
        divisionId
      })),
      skipDuplicates: true
    })

    // Create user preferences
    await prisma.userPreference.create({
      data: {
        userId: user.id
      }
    });

    // Fetch user with roles
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    const { password: _, ...userWithoutPassword } = userWithRoles;

    // Log user creation
    await auditLogService.logUser(req.user.id, 'CREATE', userWithRoles, req, {
      roleIds,
      divisionIds: normalizedDivisionIds
    });

    return ResponseFormatter.success(
      res,
      { user: userWithoutPassword },
      'User created successfully',
      201
    );
  });

  resetPassword = asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id)

    const user = await prisma.user.findUnique({
      where: { id: userId }
    })
    if (!user) {
      return ResponseFormatter.error(res, 'User not found', 404)
    }

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10)

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        failedAttempts: 0,
        lockedUntil: null
      }
    })

    await auditLogService.logUser(req.user.id, 'RESET_PASSWORD', updated, req)

    return ResponseFormatter.success(res, null, 'Password reset successfully')
  })

  /**
   * Update user
   * PUT /api/users/:id
   */
  updateUser = asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);
    const { firstName, lastName, phone, department, position, employeeId, roleIds } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      return ResponseFormatter.error(res, 'User not found', 404);
    }

    // Update user
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (employeeId !== undefined) updateData.employeeId = employeeId;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    // Update roles if provided
    if (roleIds && Array.isArray(roleIds)) {
      // Remove existing roles
      await prisma.userRole.deleteMany({
        where: { userId }
      });

      // Add new roles
      if (roleIds.length > 0) {
        await prisma.userRole.createMany({
          data: roleIds.map(roleId => ({
            userId,
            roleId: parseInt(roleId)
          }))
        });
      }
    }

    // Fetch user with updated roles
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    const { password: _, ...userWithoutPassword } = userWithRoles;

    // Log user update
    await auditLogService.logUser(req.user.id, 'UPDATE', userWithRoles, req, {
      roleIds,
      updatedFields: Object.keys(updateData)
    });

    return ResponseFormatter.success(
      res,
      { user: userWithoutPassword },
      'User updated successfully'
    );
  });

  /**
   * Delete user
   * DELETE /api/users/:id
   */
  deleteUser = asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return ResponseFormatter.error(res, 'User not found', 404);
    }

    // Prevent self-deletion
    if (userId === req.user.id) {
      return ResponseFormatter.error(res, 'You cannot delete your own account', 400);
    }

    // Log user deletion before deleting
    await auditLogService.logUser(req.user.id, 'DELETE', user, req);

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId }
    });

    return ResponseFormatter.success(
      res,
      null,
      'User deleted successfully'
    );
  });

  /**
   * Update user status
   * PATCH /api/users/:id/status
   */
  updateUserStatus = asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);
    const { status } = req.body;

    if (!status || !['ACTIVE', 'INACTIVE', 'LOCKED'].includes(status)) {
      return ResponseFormatter.error(res, 'Invalid status value', 400);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return ResponseFormatter.error(res, 'User not found', 404);
    }

    // Prevent self-deactivation
    if (userId === req.user.id && status !== 'ACTIVE') {
      return ResponseFormatter.error(res, 'You cannot deactivate your own account', 400);
    }

    // Update status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    const { password: _, ...userWithoutPassword } = updatedUser;

    // Log status change
    await auditLogService.logUser(req.user.id, status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE', updatedUser, req, {
      newStatus: status,
      previousStatus: user.status
    });

    return ResponseFormatter.success(
      res,
      { user: userWithoutPassword },
      'User status updated successfully'
    );
  });
}

module.exports = { usersController: new UsersController() };
