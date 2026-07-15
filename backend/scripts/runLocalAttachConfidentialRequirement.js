const BASE_URL = process.env.BASE_URL || 'http://localhost:4000/api'

const ADMIN_EMAIL = 'admin@company.com'
const ADMIN_PASSWORD = 'Admin@123'
const VIEWER_EMAIL = 'hanish.local@company.com'
const VIEWER_PASSWORD = 'Hanish@123'

async function login(email, password) {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(json)}`)
  }

  return json.data?.accessToken || json.data?.token || json.data?.data?.accessToken || json.token
}

async function callApi(token, path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': options.body ? 'application/json' : (options.headers || {})['Content-Type']
    }
  })

  const contentType = response.headers.get('content-type') || ''
  let body
  if (contentType.includes('application/json')) {
    body = await response.json().catch(() => null)
  } else {
    body = await response.text().catch(() => '')
  }

  return { ok: response.ok, status: response.status, contentType, body }
}

function extractPayload(body, key) {
  if (!body || typeof body !== 'object') return null
  if (body.data && Object.prototype.hasOwnProperty.call(body.data, key)) return body.data[key]
  if (body.data?.data && Object.prototype.hasOwnProperty.call(body.data.data, key)) return body.data.data[key]
  if (Object.prototype.hasOwnProperty.call(body, key)) return body[key]
  return null
}

async function main() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  const viewerToken = await login(VIEWER_EMAIL, VIEWER_PASSWORD)

  const adminProjects = await callApi(adminToken, '/project-tracking/projects')
  const projectList = extractPayload(adminProjects.body, 'projects') || []
  const targetProject = projectList.find((project) => String(project.code || '').startsWith('LCR-A-'))
  if (!targetProject) throw new Error('No local LCR-A- project found')

  const iterationId = targetProject.iterations?.[0]?.id
  if (!iterationId) throw new Error('No iteration found on project payload')

  const adminItemsBefore = await callApi(adminToken, `/project-tracking/iterations/${iterationId}/items`)
  const itemsBefore = extractPayload(adminItemsBefore.body, 'items') || []
  const itemId = itemsBefore[0]?.id
  if (!itemId) throw new Error('No item found in iteration items')

  const adminSearch = await callApi(adminToken, `/project-tracking/documents/search?q=LCR-A`)
  const candidates = extractPayload(adminSearch.body, 'documents') || []
  const targetDoc = candidates.find((d) => String(d.fileCode || '').startsWith('LCR-A/'))
  if (!targetDoc) throw new Error('No LCR-A document found in search results')

  const linkRes = await callApi(adminToken, `/project-tracking/items/${itemId}/link-document`, {
    method: 'POST',
    body: JSON.stringify({ documentId: Number(targetDoc.id) })
  })

  const adminGetAfter = await callApi(adminToken, `/documents/${targetDoc.id}`)
  const viewerGetAfter = await callApi(viewerToken, `/documents/${targetDoc.id}`)
  const viewerDownloadAfter = await callApi(viewerToken, `/documents/${targetDoc.id}/download`)

  console.log(JSON.stringify({
    projectId: targetProject.id,
    iterationId,
    itemId,
    documentId: targetDoc.id,
    linkRes: { status: linkRes.status, body: linkRes.body },
    adminGetAfter: { status: adminGetAfter.status, isConfidential: adminGetAfter.body?.data?.document?.isConfidential },
    viewerGetAfter: { status: viewerGetAfter.status, body: viewerGetAfter.body },
    viewerDownloadAfter: { status: viewerDownloadAfter.status, contentType: viewerDownloadAfter.contentType }
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

