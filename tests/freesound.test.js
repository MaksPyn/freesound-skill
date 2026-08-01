'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')

const {
  FreesoundError,
  RateLimiter,
  apiGet,
  attributionRecord,
  authorization,
  buildSearch,
  createConfig,
  estimatedPreviewSize,
  licenseInfo,
  loadCredentialFile,
  parseArgs,
  parseEnvFile,
  previewKey,
  renderAttributionMarkdown,
  safeFilename,
  searchSounds,
  streamDownload,
  writeAttribution,
} = require('../scripts/freesound.js')

function md5(data) { return crypto.createHash('md5').update(data).digest('hex') }

async function withServer(handler, fn) {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try { return await fn(`http://127.0.0.1:${address.port}`) }
  finally { await new Promise(resolve => server.close(resolve)) }
}

async function tempConfig(baseUrl = 'https://freesound.org/apiv2') {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'freesound-test-'))
  return {
    directory,
    config: {
      ...createConfig({ 'base-url': baseUrl, 'no-cache': true, retries: '0' }),
      apiKey: 'test-api-secret', oauthToken: '', cacheDir: directory,
      minuteLimit: 55, dailyLimit: 1900,
    },
  }
}

test('parseArgs supports repeated filters and never requires secret arguments', () => {
  const parsed = parseArgs(['search', 'rain', '--tag', 'field recording', '--tag=storm', '--commercial-safe', '--limit', '20'])
  assert.deepEqual(parsed.positional, ['search', 'rain'])
  assert.deepEqual(parsed.options.tag, ['field recording', 'storm'])
  assert.equal(parsed.options['commercial-safe'], true)
  assert.equal(parsed.options.limit, '20')
})

test('credential file parser is allowlisted and environment values take precedence', async () => {
  const parsed = parseEnvFile(`
# Freesound credentials
FREESOUND_API_KEY="from-file"
export FREESOUND_OAUTH_ACCESS_TOKEN='oauth-file'
UNRELATED_SECRET=must-not-load
FREESOUND_USER_AGENT=Test App/1.0 # comment
`)
  assert.deepEqual(parsed, {
    FREESOUND_API_KEY: 'from-file',
    FREESOUND_OAUTH_ACCESS_TOKEN: 'oauth-file',
    FREESOUND_USER_AGENT: 'Test App/1.0',
  })

  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'freesound-env-'))
  const file = path.join(directory, 'credentials.env')
  const environment = { FREESOUND_API_KEY: 'explicit-environment' }
  try {
    await fsp.writeFile(file, 'FREESOUND_API_KEY=from-file\nFREESOUND_OAUTH_ACCESS_TOKEN=oauth-file\n')
    const status = await loadCredentialFile(file, environment)
    assert.equal(status.found, true)
    assert.deepEqual(status.loaded, ['FREESOUND_OAUTH_ACCESS_TOKEN'])
    assert.equal(environment.FREESOUND_API_KEY, 'explicit-environment')
    assert.equal(environment.FREESOUND_OAUTH_ACCESS_TOKEN, 'oauth-file')
  } finally { await fsp.rm(directory, { recursive: true, force: true }) }
})

test('authorization uses headers and enforces OAuth when required', () => {
  assert.equal(authorization({ apiKey: 'abc', oauthToken: '' }), 'Token abc')
  assert.equal(authorization({ apiKey: 'abc', oauthToken: 'oauth' }), 'Bearer oauth')
  assert.equal(authorization({ apiKey: 'abc', oauthToken: 'oauth' }, 'oauth'), 'Bearer oauth')
  assert.throws(() => authorization({ apiKey: 'abc', oauthToken: '' }, 'oauth'), /OAuth access token required/)
  assert.throws(() => authorization({ apiKey: '', oauthToken: '' }), /API key required/)
})

test('buildSearch creates current API filters, mandatory fields, and mappings', () => {
  const query = buildSearch({
    tag: ['field recording'], license: 'cc-by', 'duration-min': '1', 'duration-max': '5',
    'commercial-safe': true, descriptor: ['bpm=[119 TO 121]'], sort: 'downloads', limit: '30',
  }, 'rain')
  assert.equal(query.query, 'rain')
  assert.match(query.filter, /tag:"field recording"/)
  assert.match(query.filter, /license:"Attribution"/)
  assert.match(query.filter, /duration:\[1 TO 5\]/)
  assert.match(query.filter, /bpm:\[119 TO 121\]/)
  assert.equal(query.sort, 'downloads_desc')
  assert.equal(query.page_size, 30)
  assert.match(query.fields, /license/)
  assert.match(query.fields, /gen_ai_preference/)
  assert.match(query.fields, /previews/)
  assert.throws(() => buildSearch({ 'duration-min': 10, 'duration-max': 5 }, 'x'), /cannot exceed/)
})

test('license normalization distinguishes commercial and attribution requirements', () => {
  assert.deepEqual(
    { key: licenseInfo('https://creativecommons.org/publicdomain/zero/1.0/').key, attribution: licenseInfo('Creative Commons 0').attribution },
    { key: 'cc0', attribution: false },
  )
  assert.equal(licenseInfo('https://creativecommons.org/licenses/by/4.0/').key, 'cc-by')
  assert.equal(licenseInfo('Attribution NonCommercial').commercial, false)
  assert.equal(licenseInfo('Sampling+').commercial, null)
})

test('preview selection and estimates are explicit', () => {
  assert.equal(previewKey({ quality: 'hq', format: 'ogg' }), 'preview-hq-ogg')
  assert.equal(previewKey({}), 'preview-hq-mp3')
  assert.equal(estimatedPreviewSize({ duration: 10 }, 'preview-hq-mp3'), 160000)
  assert.throws(() => previewKey({ quality: 'lossless', format: 'wav' }), /quality must be/)
})

test('attribution output records license, creator, source, and Gen-AI preference', async () => {
  const sound = {
    id: 42, name: 'Rain.wav', username: 'Recorder', url: 'https://freesound.org/s/42/',
    license: 'Attribution', gen_ai_preference: 'open-source-models',
  }
  const record = attributionRecord(sound, 'preview-hq-mp3')
  const markdown = renderAttributionMarkdown([record])
  assert.match(markdown, /Rain\.wav/)
  assert.match(markdown, /Recorder/)
  assert.match(markdown, /CC BY 4\.0/)
  assert.match(markdown, /open-source-models/)

  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'freesound-attribution-'))
  try {
    await writeAttribution(directory, record)
    await writeAttribution(directory, record)
    const json = JSON.parse(await fsp.readFile(path.join(directory, 'attribution.json'), 'utf8'))
    assert.equal(json.length, 1)
    assert.match(await fsp.readFile(path.join(directory, 'ATTRIBUTION.md'), 'utf8'), /Freesound attribution/)
  } finally { await fsp.rm(directory, { recursive: true, force: true }) }
})

test('apiGet sends API key only in Authorization header', async () => {
  let observed
  await withServer((req, res) => {
    observed = { url: req.url, authorization: req.headers.authorization }
    res.setHeader('Content-Type', 'application/json')
    res.end('{"ok":true}')
  }, async baseUrl => {
    const { directory, config } = await tempConfig(`${baseUrl}/apiv2`)
    try { assert.deepEqual(await apiGet('/search/', { query: 'rain' }, config), { ok: true }) }
    finally { await fsp.rm(directory, { recursive: true, force: true }) }
  })
  assert.equal(observed.authorization, 'Token test-api-secret')
  assert.equal(observed.url, '/apiv2/search/?query=rain')
  assert.doesNotMatch(observed.url, /secret|token=/)
})

test('API errors do not expose credential values', async () => {
  await withServer((req, res) => {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end('{"detail":"Invalid token"}')
  }, async baseUrl => {
    const { directory, config } = await tempConfig(`${baseUrl}/apiv2`)
    try {
      await assert.rejects(() => apiGet('/search/', {}, config), error => {
        assert.doesNotMatch(error.message, /test-api-secret/)
        assert.match(error.message, /Invalid token/)
        return true
      })
    } finally { await fsp.rm(directory, { recursive: true, force: true }) }
  })
})

test('searchSounds paginates only until the requested limit', async () => {
  let requests = 0
  await withServer((req, res) => {
    requests++
    const url = new URL(req.url, 'http://localhost')
    const page = Number(url.searchParams.get('page'))
    res.setHeader('Content-Type', 'application/json')
    const results = page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }, { id: 4 }]
    res.end(JSON.stringify({ count: 10, next: page === 1 ? 'next' : null, previous: null, results }))
  }, async baseUrl => {
    const { directory, config } = await tempConfig(`${baseUrl}/apiv2`)
    try {
      const result = await searchSounds('rain', { limit: '3', 'page-size': '2' }, config)
      assert.deepEqual(result.results.map(item => item.id), [1, 2, 3])
      assert.equal(result.returned, 3)
    } finally { await fsp.rm(directory, { recursive: true, force: true }) }
  })
  assert.equal(requests, 2)
})

test('local rate limiter enforces a daily safety ceiling', async () => {
  const { directory, config } = await tempConfig()
  config.dailyLimit = 1
  try {
    const limiter = new RateLimiter(config)
    await limiter.beforeRequest()
    await assert.rejects(() => limiter.beforeRequest(), /requests\/day reached/)
  } finally { await fsp.rm(directory, { recursive: true, force: true }) }
})

test('safeFilename strips traversal and platform-invalid characters', () => {
  assert.equal(safeFilename('../bad:name?.wav'), 'bad_name_.wav')
  assert.throws(() => safeFilename('..'), /Unsafe filename/)
})

test('streamDownload streams and verifies the original MD5', async () => {
  const payload = Buffer.from('freesound original fixture')
  await withServer((req, res) => {
    res.setHeader('Content-Length', payload.length)
    res.end(payload)
  }, async baseUrl => {
    const { directory, config } = await tempConfig(`${baseUrl}/apiv2`)
    const destination = path.join(directory, 'sound.wav')
    try {
      const result = await streamDownload(`${baseUrl}/file.wav`, destination, config, {}, { expectedMd5: md5(payload) })
      assert.equal(result.status, 'downloaded')
      assert.deepEqual(await fsp.readFile(destination), payload)
      const skipped = await streamDownload(`${baseUrl}/file.wav`, destination, config, {}, { expectedMd5: md5(payload) })
      assert.equal(skipped.status, 'skipped')
    } finally { await fsp.rm(directory, { recursive: true, force: true }) }
  })
})

test('streamDownload removes partial files when byte cap is exceeded', async () => {
  const payload = Buffer.alloc(4096, 1)
  await withServer((req, res) => res.end(payload), async baseUrl => {
    const { directory, config } = await tempConfig(`${baseUrl}/apiv2`)
    const destination = path.join(directory, 'preview.mp3')
    try {
      await assert.rejects(() => streamDownload(`${baseUrl}/preview.mp3`, destination, config, { 'max-bytes': '100' }), /exceeded --max-bytes/)
      await assert.rejects(() => fsp.stat(destination), { code: 'ENOENT' })
      const files = await fsp.readdir(directory)
      assert.equal(files.some(file => file.endsWith('.part')), false)
    } finally { await fsp.rm(directory, { recursive: true, force: true }) }
  })
})
