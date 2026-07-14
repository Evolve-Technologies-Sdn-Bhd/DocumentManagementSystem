const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    include: {
      roles: {
        include: {
          role: true
        }
      }
    },
    orderBy: { id: 'asc' }
  })

  const projects = await prisma.project.findMany({
    include: {
      projectCategory: true,
      manager: true,
      iterations: {
        include: {
          currentStage: true,
          items: {
            include: {
              documentType: true,
              links: {
                include: {
                  document: {
                    include: {
                      confidentialAccess: {
                        include: {
                          user: true,
                          role: true
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          links: {
            where: { itemId: null },
            include: {
              document: {
                include: {
                  confidentialAccess: {
                    include: {
                      user: true,
                      role: true
                    }
                  }
                }
              },
              stage: true
            }
          }
        }
      }
    },
    orderBy: { id: 'asc' }
  })

  console.log(JSON.stringify({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      roles: user.roles.map((entry) => entry.role.name)
    })),
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      category: project.projectCategory?.name || null,
      manager: project.manager?.email || null,
      iterations: project.iterations.map((iteration) => ({
        id: iteration.id,
        name: iteration.name,
        currentStage: iteration.currentStage?.name || null,
        items: iteration.items.map((item) => ({
          id: item.id,
          documentType: item.documentType?.name || null,
          status: item.status,
          links: item.links.map((link) => ({
            linkId: link.id,
            documentId: link.document?.id || null,
            fileCode: link.document?.fileCode || null,
            title: link.document?.title || null,
            status: link.document?.status || null,
            stage: link.document?.stage || null,
            isConfidential: link.document?.isConfidential || false,
            ownerId: link.document?.ownerId || null,
            createdById: link.document?.createdById || null,
            access: (link.document?.confidentialAccess || []).map((entry) => ({
              user: entry.user?.email || null,
              role: entry.role?.name || null,
              canView: entry.canView
            }))
          }))
        })),
        stageDocuments: iteration.links.map((link) => ({
          linkId: link.id,
          stage: link.stage?.name || null,
          documentId: link.document?.id || null,
          fileCode: link.document?.fileCode || null,
          title: link.document?.title || null,
          status: link.document?.status || null,
          isConfidential: link.document?.isConfidential || false,
          ownerId: link.document?.ownerId || null,
          createdById: link.document?.createdById || null,
          access: (link.document?.confidentialAccess || []).map((entry) => ({
            user: entry.user?.email || null,
            role: entry.role?.name || null,
            canView: entry.canView
          }))
        }))
      }))
    }))
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
