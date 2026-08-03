const fs = require('fs')
const path = require('path')
const prisma = require('../src/config/database')

function hasFlag(name) {
  return process.argv.includes(name)
}

function getArgValue(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number.parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

function uniq(arr) {
  return Array.from(new Set(arr))
}

async function getLinkedDivisionIds(projectId) {
  const links = await prisma.projectDocumentLink.findMany({
    where: { iteration: { projectId } },
    select: {
      document: { select: { folderId: true, divisionId: true } }
    }
  })

  const docs = links.map((l) => l.document).filter(Boolean)
  const folderIds = uniq(docs.map((d) => d.folderId).filter((id) => id != null))

  const folderDivisions = folderIds.length
    ? await prisma.folderDivision.findMany({
      where: { folderId: { in: folderIds } },
      select: { folderId: true, divisionId: true }
    })
    : []

  const folderDivisionMap = new Map()
  folderDivisions.forEach((fd) => {
    const key = fd.folderId
    const current = folderDivisionMap.get(key) || []
    current.push(fd.divisionId)
    folderDivisionMap.set(key, current)
  })

  const divisionIds = []
  docs.forEach((d) => {
    if (d.folderId != null) {
      const ids = folderDivisionMap.get(d.folderId) || []
      ids.forEach((id) => divisionIds.push(id))
      return
    }
    if (d.divisionId != null) divisionIds.push(d.divisionId)
  })

  return uniq(divisionIds).filter((id) => id != null)
}

async function loadMappings(mappingPath) {
  if (!mappingPath) return []
  const absPath = path.isAbsolute(mappingPath)
    ? mappingPath
    : path.resolve(process.cwd(), mappingPath)
  const raw = fs.readFileSync(absPath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('Mapping file must be a JSON array: [{ "projectId": 1, "divisionId": 2 }, ...]')
  }
  return parsed
    .map((row) => ({
      projectId: toInt(row?.projectId),
      divisionId: toInt(row?.divisionId)
    }))
    .filter((row) => row.projectId != null && row.divisionId != null)
}

async function main() {
  const apply = hasFlag('--apply')
  const force = hasFlag('--force')

  const actorId = toInt(getArgValue('--actor-id'))
  const projectId = toInt(getArgValue('--project-id'))
  const divisionId = toInt(getArgValue('--division-id'))
  const mappingPath = getArgValue('--mapping')

  const mappingsFromFile = await loadMappings(mappingPath)

  const explicitMappings = projectId != null && divisionId != null
    ? [{ projectId, divisionId }]
    : []

  const mappings = [...explicitMappings, ...mappingsFromFile]

  const unscopedProjects = await prisma.project.findMany({
    where: { divisionId: null },
    select: {
      id: true,
      code: true,
      name: true,
      managerId: true,
      createdById: true,
      createdAt: true
    },
    orderBy: [{ createdAt: 'desc' }]
  })

  const linkedDivisionIdsByProject = new Map()
  const allLinkedDivisionIds = []
  for (const project of unscopedProjects) {
    const linkedDivisionIds = await getLinkedDivisionIds(project.id)
    linkedDivisionIdsByProject.set(project.id, linkedDivisionIds)
    linkedDivisionIds.forEach((id) => allLinkedDivisionIds.push(id))
  }

  const linkedDivisions = allLinkedDivisionIds.length
    ? await prisma.division.findMany({
      where: { id: { in: uniq(allLinkedDivisionIds) } },
      select: { id: true, code: true, name: true, isActive: true }
    })
    : []
  const linkedDivisionMap = new Map(linkedDivisions.map((d) => [d.id, d]))

  const unassignedProjectsPreview = unscopedProjects.map((p) => {
    const linkedIds = linkedDivisionIdsByProject.get(p.id) || []
    const linked = linkedIds.map((id) => linkedDivisionMap.get(id) || { id }).filter(Boolean)
    return {
      ...p,
      linkedDivisionIds: linkedIds,
      linkedDivisions: linked,
      suggestedDivisionId: linkedIds.length === 1 ? linkedIds[0] : null
    }
  })

  const report = {
    dryRun: !apply,
    unassignedProjects: unscopedProjects.length,
    updatesRequested: mappings.length,
    updatesApplied: 0,
    warnings: []
  }

  const preview = {
    unassignedProjects: unassignedProjectsPreview,
    requestedUpdates: mappings
  }

  if (!apply) {
    process.stdout.write(JSON.stringify({ report, preview }, null, 2) + '\n')
    return
  }

  if (mappings.length === 0) {
    throw new Error('No updates specified. Use --project-id + --division-id, or --mapping <file.json>')
  }

  const divisionIds = uniq(mappings.map((m) => m.divisionId))
  const divisions = await prisma.division.findMany({
    where: { id: { in: divisionIds } },
    select: { id: true, code: true, name: true, isActive: true }
  })
  const divisionMap = new Map(divisions.map((d) => [d.id, d]))

  await prisma.$transaction(async (tx) => {
    for (const mapping of mappings) {
      const targetDivision = divisionMap.get(mapping.divisionId)
      if (!targetDivision) {
        throw new Error(`Division not found: ${mapping.divisionId}`)
      }
      if (!targetDivision.isActive) {
        throw new Error(`Division is inactive: ${mapping.divisionId}`)
      }

      const existing = await tx.project.findUnique({
        where: { id: mapping.projectId },
        select: { id: true, code: true, divisionId: true }
      })
      if (!existing) {
        throw new Error(`Project not found: ${mapping.projectId}`)
      }

      if (existing.divisionId != null) {
        throw new Error(`Project already has divisionId (projectId=${existing.id}, divisionId=${existing.divisionId})`)
      }

      const linkedDivisionIds = await getLinkedDivisionIds(existing.id)
      const mismatch = linkedDivisionIds.length > 0 && !linkedDivisionIds.includes(mapping.divisionId)
      if (mismatch && !force) {
        throw new Error(
          `Project has linked documents outside target division (projectId=${existing.id}, linkedDivisionIds=${linkedDivisionIds.join(',')}, targetDivisionId=${mapping.divisionId}). Use --force to override.`
        )
      }

      await tx.project.update({
        where: { id: existing.id },
        data: { divisionId: mapping.divisionId }
      })

      if (actorId != null) {
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'UPDATE',
            entity: 'Project',
            entityId: existing.id,
            description: `projectId=${existing.id} backfilled divisionId=${mapping.divisionId}`,
            metadata: {
              projectId: existing.id,
              code: existing.code,
              previousDivisionId: null,
              nextDivisionId: mapping.divisionId
            }
          }
        })
      } else {
        report.warnings.push(`No auditLog written for projectId=${existing.id} (missing --actor-id)`)
      }

      report.updatesApplied += 1
    }
  })

  process.stdout.write(JSON.stringify({ report, preview }, null, 2) + '\n')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    process.stderr.write(String(err?.stack || err) + '\n')
    try {
      await prisma.$disconnect()
    } catch {
    }
    process.exitCode = 1
  })
