const { PrismaClient } = require('@prisma/client');
const auditLogService = require('../services/auditLogService');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');

const prisma = new PrismaClient();

class RolesController {
  /**
   * Get all roles
   * GET /api/roles
   */
  getAllRoles = asyncHandler(async (req, res) => {
    const roles = await prisma.role.findMany({
      include: {
        _count: {
          select: { users: true }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return ResponseFormatter.success(
      res,
      { roles },
      'Roles retrieved successfully'
    );
  });

  /**
   * Get role by ID
   * GET /api/roles/:id
   */
  getRoleById = asyncHandler(async (req, res) => {
    const roleId = parseInt(req.params.id);

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!role) {
      return ResponseFormatter.error(res, 'Role not found', 404);
    }

    return ResponseFormatter.success(
      res,
      { role },
      'Role retrieved successfully'
    );
  });

  /**
   * Create new role
   * POST /api/roles
   */
  createRole = asyncHandler(async (req, res) => {
    const { name, displayName, description, permissions } = req.body;

    // Validation
    if (!name || !displayName) {
      return ResponseFormatter.error(res, 'Name and display name are required', 400);
    }

    // Check if role already exists
    const existingRole = await prisma.role.findUnique({
      where: { name }
    });

    if (existingRole) {
      return ResponseFormatter.error(res, 'Role with this name already exists', 400);
    }

    // Create role
    const role = await prisma.role.create({
      data: {
        name,
        displayName,
        description,
        permissions: permissions ? JSON.stringify(permissions) : null,
        isSystem: false
      }
    });

    // Log role creation
    await auditLogService.logSystem(req.user.id, 'ROLE_CREATE', 'Role', req, {
      roleId: role.id,
      roleName: role.name,
      displayName: role.displayName
    });

    return ResponseFormatter.success(
      res,
      { role },
      'Role created successfully',
      201
    );
  });

  /**
   * Update role
   * PUT /api/roles/:id
   */
  updateRole = asyncHandler(async (req, res) => {
    const roleId = parseInt(req.params.id);
    const { displayName, description, permissions } = req.body;

    // Check if role exists
    const existingRole = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!existingRole) {
      return ResponseFormatter.error(res, 'Role not found', 404);
    }

    // Prevent updating system roles' name and description
    if (existingRole.isSystem && (displayName !== undefined || description !== undefined)) {
      return ResponseFormatter.error(res, 'Cannot modify system role name or description', 400);
    }

    // Update role
    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);

    const role = await prisma.role.update({
      where: { id: roleId },
      data: updateData
    });

    // Log role update
    await auditLogService.logSystem(req.user.id, 'ROLE_UPDATE', 'Role', req, {
      roleId: role.id,
      roleName: role.name,
      updatedFields: Object.keys(updateData)
    });

    return ResponseFormatter.success(
      res,
      { role },
      'Role updated successfully'
    );
  });

  /**
   * Update system role permissions only
   * PATCH /api/roles/:id/permissions
   */
  updateRolePermissions = asyncHandler(async (req, res) => {
    const roleId = parseInt(req.params.id);
    const { permissions } = req.body;

    if (!permissions) {
      return ResponseFormatter.error(res, 'Permissions are required', 400);
    }

    // Check if role exists
    const existingRole = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!existingRole) {
      return ResponseFormatter.error(res, 'Role not found', 404);
    }

    try {
      // Update permissions only
      const role = await prisma.role.update({
        where: { id: roleId },
        data: {
          permissions: JSON.stringify(permissions)
        }
      });

      // Log permission update
      await auditLogService.logSystem(req.user.id, 'ROLE_PERMISSION_UPDATE', 'Role', req, {
        roleId: role.id,
        roleName: existingRole.name,
        isSystem: existingRole.isSystem
      });

      return ResponseFormatter.success(
        res,
        { role },
        `${existingRole.isSystem ? 'System role' : 'Role'} permissions updated successfully`
      );
    } catch (updateError) {
      console.error('Error updating role permissions:', updateError);
      throw updateError;
    }
  });

  /**
   * Delete role
   * DELETE /api/roles/:id
   */
  deleteRole = asyncHandler(async (req, res) => {
    const roleId = parseInt(req.params.id);

    // Check if role exists
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!role) {
      return ResponseFormatter.error(res, 'Role not found', 404);
    }

    // Prevent deleting system roles (admin only)
    if (role.isSystem) {
      return ResponseFormatter.error(
        res, 
        'Cannot delete the Administrator role. This is a protected system role required for system management.', 
        400
      );
    }

    // Prevent deleting roles with assigned users
    if (role._count.users > 0) {
      return ResponseFormatter.error(
        res,
        `Cannot delete role. It is assigned to ${role._count.users} user(s)`,
        400
      );
    }

    // Log role deletion before deleting
    await auditLogService.logSystem(req.user.id, 'ROLE_DELETE', 'Role', req, {
      roleId: role.id,
      roleName: role.name,
      displayName: role.displayName
    });

    // Delete role
    await prisma.role.delete({
      where: { id: roleId }
    });

    return ResponseFormatter.success(
      res,
      null,
      'Role deleted successfully'
    );
  });
}

module.exports = { rolesController: new RolesController() };
