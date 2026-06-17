const prisma = require('../config/database');
const folderPermissionService = require('./folderPermissionService')

/**
 * Service for managing document assignments
 * Controls who can access documents based on workflow assignments
 */
class DocumentAssignmentService {
  hasPrivilegedWorkflowAccess(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : []
    return roles.some((role) => ['admin', 'document_controller'].includes(String(role || '').toLowerCase()))
  }

  /**
   * Assign a document to a user for a specific workflow stage
   * @param {number} documentId 
   * @param {number} userId 
   * @param {string} assignmentType - REVIEW, FIRST_APPROVAL, SECOND_APPROVAL, ACKNOWLEDGMENT
   * @param {number} assignedById - User who made the assignment
   */
  async assignDocument(documentId, userId, assignmentType, assignedById = null) {
    // Use upsert to avoid duplicates
    const assignment = await prisma.documentAssignment.upsert({
      where: {
        documentId_userId_assignmentType: {
          documentId,
          userId,
          assignmentType
        }
      },
      update: {
        assignedById,
        createdAt: new Date() // Update timestamp
      },
      create: {
        documentId,
        userId,
        assignmentType,
        assignedById
      }
    });

    return assignment;
  }

  /**
   * Remove a specific assignment
   */
  async removeAssignment(documentId, userId, assignmentType) {
    await prisma.documentAssignment.deleteMany({
      where: {
        documentId,
        userId,
        assignmentType
      }
    });
  }

  /**
   * Remove all assignments of a specific type for a document
   * Useful when a workflow stage is completed
   */
  async removeAssignmentsByType(documentId, assignmentType) {
    await prisma.documentAssignment.deleteMany({
      where: {
        documentId,
        assignmentType
      }
    });
  }

  /**
   * Remove all assignments for a document
   * Used when document is published or workflow is reset
   */
  async removeAllAssignments(documentId) {
    await prisma.documentAssignment.deleteMany({
      where: {
        documentId
      }
    });
  }

  /**
   * Check if a user has access to a document through assignment
   */
  async hasAssignment(documentId, userId) {
    const count = await prisma.documentAssignment.count({
      where: {
        documentId,
        userId
      }
    });
    return count > 0;
  }

  /**
   * Get all users assigned to a document
   */
  async getAssignedUsers(documentId) {
    const assignments = await prisma.documentAssignment.findMany({
      where: {
        documentId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return assignments;
  }

  /**
   * Get all documents assigned to a user
   */
  async getUserAssignments(userId) {
    const assignments = await prisma.documentAssignment.findMany({
      where: {
        userId
      },
      include: {
        document: {
          include: {
            documentType: true,
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    return assignments;
  }

  /**
   * Check if a user can access a document
   * Returns true if:
   * - User is the owner
   * - User is the creator
   * - User has an assignment
   * - Document is published (accessible to all)
   */
  async canAccessDocument(documentId, userOrUserId) {
    const user = typeof userOrUserId === 'object' && userOrUserId ? userOrUserId : null
    const userId = user ? user.id : userOrUserId

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        ownerId: true,
        createdById: true,
        folderId: true,
        stage: true,
        status: true,
        reviewerId: true,
        firstApproverId: true,
        secondApproverId: true,
        assignments: {
          where: {
            userId
          },
          select: {
            id: true
          }
        }
      }
    });

    if (!document) {
      return false;
    }

    if (document.folderId) {
      if (!user) return false
      const ok = await folderPermissionService.canUser(document.folderId, user, 'view')
      if (!ok) return false
    }

    // Owner and creator always have access
    if (document.ownerId === userId || document.createdById === userId) {
      return true;
    }

    // Users directly assigned on the document workflow record can access it.
    if (
      document.reviewerId === userId ||
      document.firstApproverId === userId ||
      document.secondApproverId === userId
    ) {
      return true
    }

    // Has assignment
    if (document.assignments.length > 0) {
      return true;
    }

    if (document.stage === 'READY_TO_PUBLISH' && this.hasPrivilegedWorkflowAccess(user)) {
      return true
    }

    // Published, obsolete, and superseded documents are accessible to all
    if (['PUBLISHED', 'OBSOLETE', 'SUPERSEDED'].includes(document.status)) {
      return true;
    }

    return false;
  }

  /**
   * Build a where clause for document queries that enforces assignment-based access
   * This ensures users only see documents they have access to
   */
  buildAccessWhereClause(userId, roleIds = []) {
    const rids = Array.isArray(roleIds) ? roleIds.filter((x) => Number.isFinite(x)) : []
    const folderAccess = {
      OR: [
        { folderId: null },
        { folder: { accessMode: 'PUBLIC' } },
        { folder: { permissions: { some: { userId, canView: true } } } },
        ...(rids.length > 0 ? [{ folder: { permissions: { some: { roleId: { in: rids }, canView: true } } } }] : [])
      ]
    }

    return {
      AND: [
        folderAccess,
        {
          OR: [
            // Documents owned by user
            { ownerId: userId },
            // Documents created by user
            { createdById: userId },
            // Documents directly assigned in workflow fields
            { reviewerId: userId },
            { firstApproverId: userId },
            { secondApproverId: userId },
            // Documents assigned to user
            {
              assignments: {
                some: {
                  userId: userId
                }
              }
            },
            // Published documents
            { status: 'PUBLISHED' },
            // Obsolete/Superseded documents
            { status: 'OBSOLETE' },
            { status: 'SUPERSEDED' }
          ]
        }
      ]
    };
  }
}

module.exports = new DocumentAssignmentService();
