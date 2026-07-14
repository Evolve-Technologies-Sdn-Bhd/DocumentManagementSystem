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
      Authorization: `Bearer ${token}`
    }
  })

  const contentType = response.headers.get('content-type') || ''
  let body
  if (contentType.includes('application/json')) {
    body = await response.json().catch(() => null)
  } else {
    body = await response.text().catch(() => '')
  }

  return {
    status: response.status,
    ok: response.ok,
    contentType,
    body
  }
}

function extractPayload(body, key) {
  if (!body || typeof body !== 'object') return null
  if (body.data && Object.prototype.hasOwnProperty.call(body.data, key)) return body.data[key]
  if (body.data?.data && Object.prototype.hasOwnProperty.call(body.data.data, key)) return body.data.data[key]
  if (Object.prototype.hasOwnProperty.call(body, key)) return body[key]
  return null
}

async function main() {
  const setupResponse = await fetch('http://127.0.0.1:7777/logs').catch(() => null)
  if (setupResponse && setupResponse.ok) {
    await fetch('http://127.0.0.1:7777/logs', { method: 'DELETE' }).catch(() => {})
  }

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  const viewerToken = await login(VIEWER_EMAIL, VIEWER_PASSWORD)

  const adminProjects = await callApi(adminToken, '/project-tracking/projects')
  const viewerProjects = await callApi(viewerToken, '/project-tracking/projects')

  const adminProjectList = extractPayload(adminProjects.body, 'projects') || []
  const viewerProjectList = extractPayload(viewerProjects.body, 'projects') || []
  const targetProject = adminProjectList.find((project) => String(project.code || '').startsWith('LCR-'))
  if (!targetProject) {
    throw new Error('No local confidential repro project found in admin project list')
  }

  const projectId = targetProject.id
  const iterationId = targetProject.iterations?.[0]?.id
  if (!iterationId) {
    throw new Error(`Project ${projectId} has no iteration in API response`)
  }

  const adminItems = await callApi(adminToken, `/project-tracking/iterations/${iterationId}/items`)
  const viewerItems = await callApi(viewerToken, `/project-tracking/iterations/${iterationId}/items`)

  const adminItemList = extractPayload(adminItems.body, 'items') || []
  const viewerItemList = extractPayload(viewerItems.body, 'items') || []
  const adminLinkedDoc = adminItemList[0]?.links?.[0]?.document || null
  const viewerLinkedDoc = viewerItemList[0]?.links?.[0]?.document || null
  const documentId = adminLinkedDoc?.id
  if (!documentId) {
    throw new Error(`No linked document found in admin iteration items for project ${projectId}`)
  }

  const adminDownload = await callApi(adminToken, `/documents/${documentId}/download`)
  const viewerDownload = await callApi(viewerToken, `/documents/${documentId}/download`)
  const adminGetDocument = await callApi(adminToken, `/documents/${documentId}`)
  const viewerGetDocument = await callApi(viewerToken, `/documents/${documentId}`)
  const debugLogs = await fetch('http://127.0.0.1:7777/logs').then((res) => res.text()).catch(() => '')

  console.log(JSON.stringify({
    projectId,
    iterationId,
    documentId,
    projectList: {
      adminStatus: adminProjects.status,
      viewerStatus: viewerProjects.status,
      adminCount: Array.isArray(adminProjectList) ? adminProjectList.length : null,
      viewerCount: Array.isArray(viewerProjectList) ? viewerProjectList.length : null
    },
    items: {
      adminStatus: adminItems.status,
      viewerStatus: viewerItems.status,
      adminDocument: adminLinkedDoc,
      viewerDocument: viewerLinkedDoc
    },
    documentApi: {
      adminGetDocument: { status: adminGetDocument.status, body: adminGetDocument.body },
      viewerGetDocument: { status: viewerGetDocument.status, body: viewerGetDocument.body }
    },
    downloadApi: {
      adminDownload: { status: adminDownload.status, contentType: adminDownload.contentType },
      viewerDownload: { status: viewerDownload.status, contentType: viewerDownload.contentType, body: viewerDownload.body }
    },
    debugLogs
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
