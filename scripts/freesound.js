#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const VERSION = '1.0.0'
const DEFAULT_BASE_URL = 'https://freesound.org/apiv2'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_CACHE_TTL_SECONDS = 300
const DEFAULT_FIELDS = [
  'id', 'url', 'name', 'tags', 'description', 'username', 'license', 'gen_ai_preference',
  'type', 'channels', 'filesize', 'duration', 'samplerate', 'bitdepth', 'md5', 'previews',
  'num_downloads', 'avg_rating', 'category', 'subcategory', 'created',
]
const BOOLEAN_OPTIONS = new Set([
  'commercial-safe', 'dry-run', 'force', 'geotagged', 'group-by-pack', 'help', 'json',
  'no-cache', 'no-retry', 'verify', 'verbose', 'yes',
])
const REPEATABLE_OPTIONS = new Set(['descriptor', 'field', 'tag'])
const LICENSES = {
  cc0: {
    key: 'cc0', label: 'Creative Commons 0', short: 'CC0 1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: false, commercial: true,
  },
  'cc-by': {
    key: 'cc-by', label: 'Attribution', short: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true, commercial: true,
  },
  'cc-by-nc': {
    key: 'cc-by-nc', label: 'Attribution NonCommercial', short: 'CC BY-NC 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    attribution: true, commercial: false,
  },
  'sampling-plus': {
    key: 'sampling-plus', label: 'Sampling+', short: 'Sampling+',
    url: 'https://creativecommons.org/licenses/sampling+/1.0/',
    attribution: true, commercial: null,
  },
  unknown: {
    key: 'unknown', label: 'Unknown', short: 'Unknown license', url: null,
    attribution: true, commercial: null,
  },
}
const SORTS = {
  relevance: 'score', downloads: 'downloads_desc', rating: 'rating_desc', newest: 'created_desc',
  oldest: 'created_asc', shortest: 'duration_asc', longest: 'duration_desc',
}
const PREVIEW_KEYS = {
  'hq-mp3': 'preview-hq-mp3', 'lq-mp3': 'preview-lq-mp3',
  'hq-ogg': 'preview-hq-ogg', 'lq-ogg': 'preview-lq-ogg',
}
const CREDENTIAL_KEYS = new Set([
  'FREESOUND_API_KEY', 'FREESOUND_OAUTH_ACCESS_TOKEN', 'FREESOUND_USER_AGENT',
  'FREESOUND_BASE_URL', 'FREESOUND_CACHE_DIR',
])

class FreesoundError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'FreesoundError'
    Object.assign(this, details)
  }
}

function parseArgs(argv) {
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--') { positional.push(...argv.slice(i + 1)); break }
    if (!token.startsWith('--')) { positional.push(token); continue }
    const eq = token.indexOf('=')
    const key = token.slice(2, eq === -1 ? undefined : eq)
    if (!key) throw new FreesoundError('Invalid empty option')
    let value
    if (eq !== -1) value = token.slice(eq + 1)
    else if (BOOLEAN_OPTIONS.has(key)) value = true
    else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new FreesoundError(`Option --${key} requires a value`)
      }
      value = argv[++i]
    }
    if (REPEATABLE_OPTIONS.has(key)) {
      options[key] = options[key] || []
      options[key].push(value)
    } else options[key] = value
  }
  return { positional, options }
}

function optionNumber(options, key, fallback, { min = -Infinity, max = Infinity } = {}) {
  if (options[key] === undefined) return fallback
  const value = Number(options[key])
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new FreesoundError(`--${key} must be a number between ${min} and ${max}`)
  }
  return value
}

function defaultCacheDir() {
  if (process.env.FREESOUND_CACHE_DIR) return path.resolve(process.env.FREESOUND_CACHE_DIR)
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'pi-freesound')
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'pi-freesound')
}

function defaultCredentialsFile() {
  if (process.env.FREESOUND_ENV_FILE) return path.resolve(process.env.FREESOUND_ENV_FILE)
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'pi-freesound', 'credentials.env')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'pi-freesound', 'credentials.env')
}

function parseEnvFile(text) {
  const values = {}
  for (const rawLine of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice(7).trim()
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    if (!CREDENTIAL_KEYS.has(key)) continue
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0]
      value = value.slice(1, -1)
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    } else value = value.replace(/\s+#.*$/, '').trim()
    values[key] = value
  }
  return values
}

async function loadCredentialFile(filePath = defaultCredentialsFile(), environment = process.env) {
  const resolved = path.resolve(filePath)
  let text
  try { text = await fsp.readFile(resolved, 'utf8') }
  catch (error) {
    if (error.code === 'ENOENT') return { path: resolved, found: false, loaded: [] }
    throw new FreesoundError(`Could not read credentials file ${resolved}: ${error.message}`)
  }
  const values = parseEnvFile(text)
  const loaded = []
  for (const [key, value] of Object.entries(values)) {
    if (environment[key] === undefined && value !== '') {
      environment[key] = value
      loaded.push(key)
    }
  }
  return { path: resolved, found: true, loaded }
}

function createConfig(options = {}) {
  return {
    baseUrl: String(options['base-url'] || process.env.FREESOUND_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    userAgent: process.env.FREESOUND_USER_AGENT || `Pi-Freesound-Skill/${VERSION}`,
    apiKey: process.env.FREESOUND_API_KEY || '',
    oauthToken: process.env.FREESOUND_OAUTH_ACCESS_TOKEN || '',
    timeoutMs: optionNumber(options, 'timeout', DEFAULT_TIMEOUT_MS, { min: 100, max: 600_000 }),
    retries: options['no-retry'] ? 0 : optionNumber(options, 'retries', 3, { min: 0, max: 10 }),
    cache: !options['no-cache'],
    cacheTtlSeconds: optionNumber(options, 'cache-ttl', DEFAULT_CACHE_TTL_SECONDS, { min: 0, max: 604_800 }),
    cacheDir: defaultCacheDir(),
    minuteLimit: optionNumber(options, 'minute-limit', 55, { min: 1, max: 60 }),
    dailyLimit: optionNumber(options, 'daily-limit', 1900, { min: 1, max: 2000 }),
    verbose: Boolean(options.verbose),
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function retryDelay(response, attempt) {
  const value = response?.headers.get('retry-after')
  if (value) {
    const seconds = Number(value)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(value)
    if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  }
  return Math.min(8000, 500 * (2 ** attempt))
}

function cacheFile(url, cacheDir) {
  const key = crypto.createHash('sha256').update(url).digest('hex')
  return path.join(cacheDir, 'responses', `${key}.json`)
}

async function readCache(url, config) {
  try {
    const parsed = JSON.parse(await fsp.readFile(cacheFile(url, config.cacheDir), 'utf8'))
    if (!parsed.fetchedAt || Date.now() - parsed.fetchedAt > config.cacheTtlSeconds * 1000) return undefined
    return parsed.data
  } catch { return undefined }
}

async function writeCache(url, data, config) {
  const destination = cacheFile(url, config.cacheDir)
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.tmp`
  await fsp.writeFile(temporary, JSON.stringify({ fetchedAt: Date.now(), data }))
  await fsp.rm(destination, { force: true })
  await fsp.rename(temporary, destination)
}

class RateLimiter {
  constructor(config) {
    this.config = config
    this.file = path.join(config.cacheDir, 'rate-limit.json')
  }

  async read() {
    try { return JSON.parse(await fsp.readFile(this.file, 'utf8')) }
    catch { return { timestamps: [], day: '', daily: 0 } }
  }

  async beforeRequest() {
    const now = Date.now()
    const today = new Date(now).toISOString().slice(0, 10)
    const state = await this.read()
    if (state.day !== today) { state.day = today; state.daily = 0 }
    state.timestamps = (state.timestamps || []).filter(value => now - value < 60_000)
    if (state.daily >= this.config.dailyLimit) {
      throw new FreesoundError(`Local safety limit of ${this.config.dailyLimit} API requests/day reached`)
    }
    if (state.timestamps.length >= this.config.minuteLimit) {
      const wait = 60_050 - (now - state.timestamps[0])
      if (this.config.verbose) process.stderr.write(`Rate-limit pause: ${Math.ceil(wait / 1000)}s\n`)
      await sleep(Math.max(0, wait))
      return this.beforeRequest()
    }
    state.timestamps.push(Date.now())
    state.daily++
    await fsp.mkdir(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await fsp.writeFile(temporary, JSON.stringify(state))
    await fsp.rm(this.file, { force: true })
    await fsp.rename(temporary, this.file)
  }
}

function authorization(config, mode = 'token') {
  if (mode === 'oauth') {
    if (!config.oauthToken) {
      throw new FreesoundError('OAuth access token required. Set FREESOUND_OAUTH_ACCESS_TOKEN; never pass it as a command argument.')
    }
    return `Bearer ${config.oauthToken}`
  }
  if (config.oauthToken) return `Bearer ${config.oauthToken}`
  if (config.apiKey) return `Token ${config.apiKey}`
  throw new FreesoundError('Freesound API key required. Set FREESOUND_API_KEY after applying at https://freesound.org/apiv2/apply/')
}

function isRetriableStatus(status) { return status === 429 || status >= 500 }

async function fetchWithRetry(url, init, config, { apiRequest = false, limiter = null } = {}) {
  let lastError
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      if (apiRequest && limiter) await limiter.beforeRequest()
      if (config.verbose) process.stderr.write(`${init.method || 'GET'} ${new URL(url).origin}${new URL(url).pathname}${attempt ? ` (retry ${attempt})` : ''}\n`)
      const response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': config.userAgent, ...(init.headers || {}) },
        signal: AbortSignal.timeout(config.timeoutMs),
      })
      if (isRetriableStatus(response.status) && attempt < config.retries) {
        await response.body?.cancel()
        await sleep(retryDelay(response, attempt))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt >= config.retries) break
      await sleep(retryDelay(null, attempt))
    }
  }
  throw new FreesoundError(`Request failed for ${new URL(url).origin}${new URL(url).pathname}: ${lastError?.message || 'network error'}`, { cause: lastError })
}

async function apiGet(endpoint, query = {}, config = createConfig(), { auth = 'token', cache = true } = {}) {
  const url = new URL(endpoint.replace(/^\//, ''), `${config.baseUrl}/`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  if (config.cache && cache) {
    const cached = await readCache(url.href, config)
    if (cached !== undefined) return cached
  }
  const response = await fetchWithRetry(url.href, {
    headers: { Accept: 'application/json', Authorization: authorization(config, auth) },
  }, config, { apiRequest: true, limiter: new RateLimiter(config) })
  const text = await response.text()
  if (!response.ok) {
    let detail = text
    try { detail = JSON.parse(text).detail || text } catch {}
    throw new FreesoundError(`Freesound API returned ${response.status}: ${String(detail).slice(0, 500)}`, { status: response.status })
  }
  let data
  try { data = JSON.parse(text) } catch { throw new FreesoundError(`Freesound returned invalid JSON for ${url.pathname}`) }
  if (config.cache && cache) await writeCache(url.href, data, config)
  return data
}

function solrQuote(value) {
  const text = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${text}"`
}

function licenseInfo(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('sampling+')) return LICENSES['sampling-plus']
  if (text.includes('by-nc') || text.includes('noncommercial')) return LICENSES['cc-by-nc']
  if (text.includes('zero/1.0') || text.includes('creativecommons.org/publicdomain') || text.includes('creative commons 0') || text === 'cc0') return LICENSES.cc0
  if (text.includes('/by/') || text === 'attribution' || text.includes('cc by')) return LICENSES['cc-by']
  return { ...LICENSES.unknown, label: value || 'Unknown' }
}

function buildSearch(options, queryText = '') {
  const filters = []
  if (options.filter) filters.push(String(options.filter))
  for (const tag of options.tag || []) filters.push(`tag:${solrQuote(tag)}`)
  if (options.license) {
    const info = LICENSES[String(options.license).toLowerCase()]
    if (!info || info.key === 'unknown') throw new FreesoundError('--license must be cc0, cc-by, or cc-by-nc')
    filters.push(`license:${solrQuote(info.label)}`)
  }
  if (options['commercial-safe']) {
    filters.push(`(license:${solrQuote(LICENSES.cc0.label)} OR license:${solrQuote(LICENSES['cc-by'].label)})`)
  }
  const minDuration = options['duration-min']
  const maxDuration = options['duration-max']
  if (minDuration !== undefined || maxDuration !== undefined) {
    const min = minDuration === undefined ? '*' : optionNumber(options, 'duration-min', 0, { min: 0 })
    const max = maxDuration === undefined ? '*' : optionNumber(options, 'duration-max', 0, { min: 0 })
    if (min !== '*' && max !== '*' && min > max) throw new FreesoundError('--duration-min cannot exceed --duration-max')
    filters.push(`duration:[${min} TO ${max}]`)
  }
  if (options.type) filters.push(`type:${solrQuote(String(options.type).toLowerCase())}`)
  if (options.channels) filters.push(`channels:${optionNumber(options, 'channels', 1, { min: 1, max: 64 })}`)
  if (options['samplerate-min']) filters.push(`samplerate:[${optionNumber(options, 'samplerate-min', 0, { min: 1 })} TO *]`)
  if (options.category) filters.push(`category:${solrQuote(options.category)}`)
  if (options.subcategory) filters.push(`subcategory:${solrQuote(options.subcategory)}`)
  if (options.username) filters.push(`username:${solrQuote(options.username)}`)
  if (options['gen-ai']) filters.push(`gen_ai_preference:${solrQuote(options['gen-ai'])}`)
  if (options.geotagged) filters.push('is_geotagged:true')
  if (options['created-after'] || options['created-before']) {
    filters.push(`created:[${options['created-after'] || '*'} TO ${options['created-before'] || '*'}]`)
  }
  for (const descriptor of options.descriptor || []) {
    const index = descriptor.indexOf('=')
    if (index < 1) throw new FreesoundError(`Invalid --descriptor ${descriptor}; expected name=value`)
    const key = descriptor.slice(0, index)
    if (!/^[a-z][a-z0-9_]*$/i.test(key)) throw new FreesoundError(`Invalid descriptor name: ${key}`)
    filters.push(`${key}:${descriptor.slice(index + 1)}`)
  }

  const requested = [...DEFAULT_FIELDS, ...(options.field || [])]
  const fields = [...new Set(requested)].join(',')
  const sortKey = options.sort || 'relevance'
  const sort = SORTS[sortKey] || (/^[a-z][a-z0-9_]*:-?\d/i.test(sortKey) ? sortKey : null)
  if (!sort) throw new FreesoundError(`Unsupported sort: ${sortKey}`)

  return {
    query: queryText,
    filter: filters.join(' '),
    sort,
    fields,
    page: optionNumber(options, 'page', 1, { min: 1, max: 100_000 }),
    page_size: optionNumber(options, 'page-size', Math.min(optionNumber(options, 'limit', 15, { min: 1, max: 500 }), 50), { min: 1, max: 150 }),
    group_by_pack: options['group-by-pack'] ? 1 : undefined,
    similar_to: options['similar-to'],
    similarity_space: options['similarity-space'],
  }
}

async function searchSounds(queryText, options, config) {
  const parameters = buildSearch(options, queryText)
  const limit = optionNumber(options, 'limit', 15, { min: 1, max: 500 })
  const results = []
  let count = 0
  let page = parameters.page
  while (results.length < limit) {
    const data = await apiGet('/search/', { ...parameters, page }, config, { cache: true })
    count = data.count ?? count
    results.push(...(data.results || []))
    if (!data.next || !(data.results || []).length) break
    page++
  }
  return { count, results: results.slice(0, limit), page: parameters.page, returned: Math.min(results.length, limit) }
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return '-'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = Number(bytes)
  let unit = 0
  while (Math.abs(value) >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return '-'
  const value = Number(seconds)
  const minutes = Math.floor(value / 60)
  return minutes ? `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}` : `${value.toFixed(2)}s`
}

function printSearch(result) {
  if (!result.results.length) { console.log('No sounds found.'); return }
  console.log(['ID', 'NAME', 'USER', 'DURATION', 'TYPE', 'LICENSE', 'GEN_AI', 'DOWNLOADS'].join('\t'))
  for (const sound of result.results) {
    console.log([
      sound.id, sound.name || '-', sound.username || '-', formatDuration(sound.duration),
      sound.type || '-', licenseInfo(sound.license).short, sound.gen_ai_preference || '-', sound.num_downloads ?? '-',
    ].join('\t'))
  }
  console.log(`Returned ${result.returned} of ${result.count} result(s).`)
}

function soundSummary(sound) {
  const license = licenseInfo(sound.license)
  return {
    ...sound,
    license_normalized: license.key,
    license_name: license.short,
    license_url: license.url,
    attribution_required: license.attribution,
    commercial_sound_use: license.commercial,
  }
}

function printSound(sound) {
  const item = soundSummary(sound)
  console.log(`${item.name || 'Unnamed sound'} (${item.id})`)
  console.log(`Uploader: ${item.username || '-'}`)
  console.log(`URL: ${item.url || `https://freesound.org/s/${item.id}/`}`)
  console.log(`License: ${item.license_name}${item.license_url ? ` — ${item.license_url}` : ''}`)
  console.log(`Gen AI preference: ${item.gen_ai_preference || 'not provided'}`)
  console.log(`Audio: ${item.type || '-'}, ${item.channels || '-'} channel(s), ${item.samplerate || '-'} Hz, ${formatDuration(item.duration)}, ${formatBytes(item.filesize)}`)
  console.log(`Category: ${item.category || '-'} / ${item.subcategory || '-'}`)
  if (item.tags?.length) console.log(`Tags: ${item.tags.join(', ')}`)
  if (item.description) console.log(`Description: ${String(item.description).replace(/\s+/g, ' ').trim()}`)
}

function safeFilename(value) {
  const base = path.basename(String(value || 'sound').replace(/\\/g, '/'))
  const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new FreesoundError(`Unsafe filename: ${value}`)
  return cleaned
}

function ensureSafeDownloadUrl(url, config) {
  const parsed = new URL(url)
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(local && config.baseUrl.startsWith('http://'))) {
    throw new FreesoundError(`Refusing non-HTTPS download URL: ${parsed.origin}`)
  }
  return parsed.href
}

function previewKey(options) {
  const quality = String(options.quality || 'hq').toLowerCase()
  const format = String(options.format || 'mp3').toLowerCase()
  const key = PREVIEW_KEYS[`${quality}-${format}`]
  if (!key) throw new FreesoundError('--quality must be hq or lq and --format must be mp3 or ogg')
  return key
}

function estimatedPreviewSize(sound, key) {
  const kbps = { 'preview-hq-mp3': 128, 'preview-lq-mp3': 64, 'preview-hq-ogg': 192, 'preview-lq-ogg': 80 }[key]
  return Number.isFinite(Number(sound.duration)) ? Math.ceil(Number(sound.duration) * kbps * 1000 / 8) : null
}

function attributionRecord(sound, variant) {
  const license = licenseInfo(sound.license)
  return {
    id: Number(sound.id),
    name: sound.name || `Sound ${sound.id}`,
    username: sound.username || 'Unknown user',
    url: sound.url || `https://freesound.org/s/${sound.id}/`,
    license: license.short,
    license_key: license.key,
    license_url: license.url,
    attribution_required: license.attribution,
    gen_ai_preference: sound.gen_ai_preference || null,
    retrieved_at: new Date().toISOString(),
    variant,
  }
}

function renderAttributionMarkdown(records) {
  const lines = ['# Freesound attribution', '']
  for (const record of records) {
    lines.push(`## ${record.name}`)
    lines.push('')
    lines.push(`- Creator: ${record.username}`)
    lines.push(`- Source: ${record.url}`)
    lines.push(`- License: ${record.license}${record.license_url ? ` (${record.license_url})` : ''}`)
    lines.push(`- Variant: ${record.variant}`)
    if (!record.attribution_required) lines.push('- Attribution: not required by CC0; retained here for provenance')
    if (record.gen_ai_preference) lines.push(`- Generative-AI preference: ${record.gen_ai_preference}`)
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

function renderAttributionText(records) {
  return `${records.map(record => `"${record.name}" by ${record.username} (${record.url}), licensed under ${record.license}${record.license_url ? ` ${record.license_url}` : ''}`).join('\n')}\n`
}

async function writeAttribution(directory, record) {
  const jsonPath = path.join(directory, 'attribution.json')
  let records = []
  try {
    const parsed = JSON.parse(await fsp.readFile(jsonPath, 'utf8'))
    records = Array.isArray(parsed) ? parsed : []
  } catch {}
  const key = `${record.id}:${record.variant}`
  records = records.filter(item => `${item.id}:${item.variant}` !== key)
  records.push(record)
  records.sort((a, b) => Number(a.id) - Number(b.id) || String(a.variant).localeCompare(String(b.variant)))
  await fsp.mkdir(directory, { recursive: true })
  await fsp.writeFile(jsonPath, `${JSON.stringify(records, null, 2)}\n`)
  await fsp.writeFile(path.join(directory, 'ATTRIBUTION.md'), renderAttributionMarkdown(records))
  return records
}

async function md5File(filePath) {
  const hash = crypto.createHash('md5')
  await pipeline(fs.createReadStream(filePath), hash)
  return hash.digest('hex')
}

class ByteLimit extends Transform {
  constructor(limit) { super(); this.limit = limit; this.total = 0 }
  _transform(chunk, encoding, callback) {
    this.total += chunk.length
    if (this.total > this.limit) callback(new FreesoundError(`Download exceeded --max-bytes ${this.limit}`))
    else callback(null, chunk)
  }
}

async function streamDownload(url, destination, config, options = {}, { headers = {}, expectedMd5 = null, apiRequest = false } = {}) {
  const safeUrl = ensureSafeDownloadUrl(url, config)
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  try {
    const stat = await fsp.stat(destination)
    if (stat.isFile() && expectedMd5 && await md5File(destination) === String(expectedMd5).toLowerCase()) {
      return { path: destination, status: 'skipped', reason: 'checksum already matches' }
    }
    if (!options.force) throw new FreesoundError(`File exists: ${destination}. Use --force to replace it.`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const temporary = `${destination}.${process.pid}.part`
  await fsp.rm(temporary, { force: true })
  try {
    const response = await fetchWithRetry(safeUrl, { headers }, config, {
      apiRequest,
      limiter: apiRequest ? new RateLimiter(config) : null,
    })
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '')
      throw new FreesoundError(`Download returned ${response.status}: ${body.slice(0, 300)}`)
    }
    const maxBytes = options['max-bytes'] === undefined ? Infinity : optionNumber(options, 'max-bytes', Infinity, { min: 1 })
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body.cancel()
      throw new FreesoundError(`Download size ${contentLength} bytes exceeded --max-bytes ${maxBytes}`)
    }
    const streams = [Readable.fromWeb(response.body)]
    if (Number.isFinite(maxBytes)) streams.push(new ByteLimit(maxBytes))
    streams.push(fs.createWriteStream(temporary, { flags: 'wx' }))
    await pipeline(...streams)
    if (expectedMd5) {
      const actual = await md5File(temporary)
      if (actual !== String(expectedMd5).toLowerCase()) {
        throw new FreesoundError(`MD5 mismatch: expected ${expectedMd5}, got ${actual}`)
      }
    }
    if (options.force) await fsp.rm(destination, { force: true })
    await fsp.rename(temporary, destination)
    return { path: destination, status: 'downloaded', size: (await fsp.stat(destination)).size }
  } catch (error) {
    await fsp.rm(temporary, { force: true })
    throw error
  }
}

function requireSoundId(positional, command, index = 1) {
  const value = positional[index]
  if (!value || !/^\d+$/.test(value)) throw new FreesoundError(`${command} requires a numeric sound ID`)
  return Number(value)
}

function requireUsername(positional, command) {
  const value = positional[1]
  if (!value || value.length > 100 || /[\x00-\x1f/\\]/.test(value)) throw new FreesoundError(`${command} requires a valid username`)
  return value
}

function printJson(value) { console.log(JSON.stringify(value, null, 2)) }

async function getSound(id, config, cache = true) {
  return apiGet(`/sounds/${id}/`, {}, config, { cache })
}

async function commandPreview(positional, options, config) {
  const id = requireSoundId(positional, 'download-preview')
  const sound = await getSound(id, config, !options['no-cache'])
  const key = previewKey(options)
  const url = sound.previews?.[key]
  if (!url) throw new FreesoundError(`Preview ${key} is not available for sound ${id}`)
  const extension = key.endsWith('ogg') ? 'ogg' : 'mp3'
  const directory = path.resolve(options.output || path.join(process.cwd(), 'freesound-assets', String(id)))
  const destination = path.join(directory, safeFilename(`${id}_${path.parse(sound.name || 'sound').name}_${key}.${extension}`))
  const estimate = estimatedPreviewSize(sound, key)
  const plan = {
    dry_run: !options.yes || Boolean(options['dry-run']), id, variant: key, destination,
    estimated_size: estimate, estimated_size_human: formatBytes(estimate),
    license: licenseInfo(sound.license), gen_ai_preference: sound.gen_ai_preference || null,
  }
  if (!options.yes || options['dry-run']) {
    if (options.json) printJson(plan)
    else {
      console.log(`Preview: ${key}`)
      console.log(`Destination: ${destination}`)
      console.log(`Estimated size: ${formatBytes(estimate)}`)
      console.log(`License: ${plan.license.short}`)
      console.log('Dry run only. Re-run with --yes to download.')
    }
    return plan
  }
  const result = await streamDownload(url, destination, config, options)
  await writeAttribution(directory, attributionRecord(sound, key))
  const output = { ...plan, dry_run: false, result }
  if (options.json) printJson(output)
  else console.log(`${result.status}: ${result.path}\nAttribution: ${path.join(directory, 'ATTRIBUTION.md')}`)
  return output
}

async function commandOriginal(positional, options, config) {
  const id = requireSoundId(positional, 'download-original')
  authorization(config, 'oauth')
  const sound = await getSound(id, config, !options['no-cache'])
  const directory = path.resolve(options.output || path.join(process.cwd(), 'freesound-assets', String(id)))
  const name = safeFilename(`${id}_${sound.name || `sound.${sound.type || 'bin'}`}`)
  const destination = path.join(directory, name)
  const plan = {
    dry_run: !options.yes || Boolean(options['dry-run']), id, variant: 'original', destination,
    size: sound.filesize, size_human: formatBytes(sound.filesize), md5: sound.md5 || null,
    license: licenseInfo(sound.license), gen_ai_preference: sound.gen_ai_preference || null,
  }
  const maxBytes = options['max-bytes'] === undefined ? Infinity : optionNumber(options, 'max-bytes', Infinity, { min: 1 })
  if (Number(sound.filesize) > maxBytes) throw new FreesoundError(`Original is ${sound.filesize} bytes, exceeding --max-bytes ${maxBytes}`)
  if (!options.yes || options['dry-run']) {
    if (options.json) printJson(plan)
    else {
      console.log(`Original: ${sound.name} (${sound.type || 'unknown format'})`)
      console.log(`Destination: ${destination}`)
      console.log(`Size: ${formatBytes(sound.filesize)}`)
      console.log(`License: ${plan.license.short}`)
      console.log('Dry run only. Re-run with --yes to download.')
    }
    return plan
  }
  const url = `${config.baseUrl}/sounds/${id}/download/`
  const result = await streamDownload(url, destination, config, options, {
    headers: { Authorization: authorization(config, 'oauth') }, expectedMd5: sound.md5, apiRequest: true,
  })
  await writeAttribution(directory, attributionRecord(sound, 'original'))
  const output = { ...plan, dry_run: false, result }
  if (options.json) printJson(output)
  else console.log(`${result.status}: ${result.path}\nAttribution: ${path.join(directory, 'ATTRIBUTION.md')}`)
  return output
}

function licenseGuidance() {
  return {
    api: {
      noncommercial: 'Free API use is limited to non-commercial purposes.',
      commercial: 'Commercial API applications require terms negotiated with Universitat Pompeu Fabra.',
      terms: 'https://freesound.org/help/tos_api/',
    },
    sounds: Object.fromEntries(Object.entries(LICENSES).filter(([key]) => key !== 'unknown').map(([key, value]) => [key, value])),
    warning: 'A sound license and permission to use the Freesound API commercially are separate questions.',
  }
}

function helpText() {
  return `Freesound CLI ${VERSION}

Usage:
  freesound.js <command> [arguments] [options]

Discovery:
  search [query]                       Search current APIv2 endpoint
  sound <id>                          Show sound metadata and license
  similar <id>                        Find similar sounds
  analysis <id>                       Retrieve audio descriptors
  user <username>                     Show user metadata
  user-sounds <username>              List a user's sounds
  user-packs <username>               List a user's packs
  pack <id>                           Show pack metadata
  pack-sounds <id>                    List sounds in a pack
  licenses                            Explain API and sound licensing
  auth status [--verify]              Report credential presence safely

Downloads and attribution:
  download-preview <id>               Plan/download MP3 or OGG preview
  download-original <id>              Plan/download original (OAuth2 required)
  attribution <id...>                 Generate attribution from sound IDs

Search options:
  --tag <tag>                          Repeatable
  --license <cc0|cc-by|cc-by-nc>
  --commercial-safe                   Sound-license filter only
  --duration-min <seconds>
  --duration-max <seconds>
  --type <wav|aiff|flac|ogg|mp3|m4a>
  --channels <n>
  --samplerate-min <hz>
  --category <name>
  --subcategory <name>
  --username <name>
  --gen-ai <preference>
  --geotagged
  --created-after <ISO date>
  --created-before <ISO date>
  --descriptor <name=value>           Repeatable
  --filter <raw Solr filter>
  --sort <relevance|downloads|rating|newest|oldest|shortest|longest>
  --similar-to <sound-id>
  --similarity-space <laion_clap|freesound_classic>
  --group-by-pack
  --field <name>                      Repeatable extra response field
  --page <n> --page-size <1-150> --limit <1-500>

Download options:
  --quality <hq|lq>                   Preview only; default hq
  --format <mp3|ogg>                  Preview only; default mp3
  --output <directory>
  --yes                               Required to transfer files
  --dry-run
  --force
  --max-bytes <bytes>

HTTP and output:
  --json
  --timeout <milliseconds>
  --retries <0-10>
  --no-retry
  --no-cache
  --cache-ttl <seconds>
  --credentials-file <path>           Override the automatic credentials file
  --base-url <url>                    Primarily for tests
  --verbose

Environment (never pass secrets as arguments):
  FREESOUND_API_KEY
  FREESOUND_OAUTH_ACCESS_TOKEN
  FREESOUND_USER_AGENT
  FREESOUND_BASE_URL
  FREESOUND_CACHE_DIR
  FREESOUND_ENV_FILE

Automatic credentials file:
  Windows: %APPDATA%\\pi-freesound\\credentials.env
  Other:   ~/.config/pi-freesound/credentials.env

Examples:
  freesound.js search "thunder storm" --license cc0 --limit 10
  freesound.js sound 1234
  freesound.js similar 1234 --similarity-space laion_clap
  freesound.js download-preview 1234 --quality hq --format mp3
  freesound.js download-preview 1234 --quality hq --format mp3 --yes
`
}

async function listEndpoint(endpoint, options, config) {
  const page = optionNumber(options, 'page', 1, { min: 1 })
  const pageSize = optionNumber(options, 'page-size', Math.min(optionNumber(options, 'limit', 15, { min: 1, max: 500 }), 50), { min: 1, max: 150 })
  const data = await apiGet(endpoint, { page, page_size: pageSize, fields: DEFAULT_FIELDS.join(',') }, config)
  if (options.json) printJson(data)
  else if (Array.isArray(data.results) && data.results.some(item => item.id && item.license !== undefined)) {
    printSearch({ count: data.count, returned: data.results.length, results: data.results })
  } else printJson(data)
}

async function commandAttribution(positional, options, config) {
  const ids = positional.slice(1)
  if (!ids.length || ids.some(id => !/^\d+$/.test(id))) throw new FreesoundError('attribution requires one or more numeric sound IDs')
  const records = []
  for (const id of ids) records.push(attributionRecord(await getSound(Number(id), config), options.variant || 'unspecified'))
  const format = String(options.format || 'markdown').toLowerCase()
  let output
  if (format === 'json') output = `${JSON.stringify(records, null, 2)}\n`
  else if (format === 'text') output = renderAttributionText(records)
  else if (format === 'markdown' || format === 'md') output = renderAttributionMarkdown(records)
  else throw new FreesoundError('--format must be markdown, text, or json')
  if (options.output) {
    const destination = path.resolve(options.output)
    await fsp.mkdir(path.dirname(destination), { recursive: true })
    await fsp.writeFile(destination, output)
    console.log(destination)
  } else process.stdout.write(output)
}

async function main(argv = process.argv.slice(2)) {
  const { positional, options } = parseArgs(argv)
  const command = positional[0]
  if (!command || options.help || command === 'help') { console.log(helpText()); return }
  const credentialStatus = await loadCredentialFile(options['credentials-file'] || defaultCredentialsFile())
  const config = createConfig(options)
  config.credentialsFile = credentialStatus.path
  config.credentialsFileFound = credentialStatus.found

  switch (command) {
    case 'search': {
      const query = positional.slice(1).join(' ')
      if (!query && !options.filter && !(options.tag || []).length && !options.category && !options['similar-to']) {
        throw new FreesoundError('search requires a query or at least one filter')
      }
      if (options['commercial-safe']) process.stderr.write('Note: --commercial-safe filters sound licenses only; commercial API use still requires an agreement with UPF.\n')
      const result = await searchSounds(query, options, config)
      if (options.json) printJson(result)
      else printSearch(result)
      break
    }
    case 'sound': {
      const sound = await getSound(requireSoundId(positional, 'sound'), config)
      if (options.json) printJson(soundSummary(sound)); else printSound(sound)
      break
    }
    case 'similar': {
      const id = requireSoundId(positional, 'similar')
      const data = await apiGet(`/sounds/${id}/similar/`, {
        fields: DEFAULT_FIELDS.join(','), page: optionNumber(options, 'page', 1, { min: 1 }),
        page_size: optionNumber(options, 'limit', 15, { min: 1, max: 150 }),
        similarity_space: options['similarity-space'], filter: options.filter,
      }, config)
      if (options.json) printJson(data); else printSearch({ count: data.count, returned: data.results?.length || 0, results: data.results || [] })
      break
    }
    case 'analysis': {
      const id = requireSoundId(positional, 'analysis')
      printJson(await apiGet(`/sounds/${id}/analysis/`, { fields: (options.field || []).join(',') || options.fields }, config))
      break
    }
    case 'user': printJson(await apiGet(`/users/${encodeURIComponent(requireUsername(positional, 'user'))}/`, {}, config)); break
    case 'user-sounds': await listEndpoint(`/users/${encodeURIComponent(requireUsername(positional, 'user-sounds'))}/sounds/`, options, config); break
    case 'user-packs': await listEndpoint(`/users/${encodeURIComponent(requireUsername(positional, 'user-packs'))}/packs/`, options, config); break
    case 'pack': {
      const id = positional[1]
      if (!id || !/^\d+$/.test(id)) throw new FreesoundError('pack requires a numeric pack ID')
      printJson(await apiGet(`/packs/${id}/`, {}, config))
      break
    }
    case 'pack-sounds': {
      const id = positional[1]
      if (!id || !/^\d+$/.test(id)) throw new FreesoundError('pack-sounds requires a numeric pack ID')
      await listEndpoint(`/packs/${id}/sounds/`, options, config)
      break
    }
    case 'download-preview': await commandPreview(positional, options, config); break
    case 'download-original': await commandOriginal(positional, options, config); break
    case 'attribution': await commandAttribution(positional, options, config); break
    case 'licenses': printJson(licenseGuidance()); break
    case 'auth': {
      if (positional[1] !== 'status') throw new FreesoundError('Usage: auth status [--verify]')
      const status = {
        credentials_file: config.credentialsFile,
        credentials_file_found: config.credentialsFileFound,
        api_key_configured: Boolean(config.apiKey),
        oauth_token_configured: Boolean(config.oauthToken),
      }
      if (options.verify) {
        if (config.oauthToken) status.oauth_user = await apiGet('/me/', {}, config, { auth: 'oauth', cache: false })
        else if (config.apiKey) {
          await apiGet('/search/', { query: '', fields: 'id', page_size: 1 }, config, { cache: false })
          status.api_key_valid = true
        }
      }
      printJson(status)
      break
    }
    case 'cache': {
      if (positional[1] !== 'clear') throw new FreesoundError('Usage: cache clear')
      await fsp.rm(config.cacheDir, { recursive: true, force: true })
      console.log(`Cleared cache: ${config.cacheDir}`)
      break
    }
    default: throw new FreesoundError(`Unknown command: ${command}. Run with --help for usage.`)
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`Error: ${error.message}\n`)
    if (process.env.DEBUG && error.stack) process.stderr.write(`${error.stack}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  ByteLimit,
  FreesoundError,
  LICENSES,
  RateLimiter,
  apiGet,
  attributionRecord,
  authorization,
  buildSearch,
  createConfig,
  estimatedPreviewSize,
  licenseGuidance,
  licenseInfo,
  loadCredentialFile,
  md5File,
  parseArgs,
  parseEnvFile,
  previewKey,
  renderAttributionMarkdown,
  renderAttributionText,
  safeFilename,
  searchSounds,
  solrQuote,
  soundSummary,
  streamDownload,
  defaultCredentialsFile,
  writeAttribution,
}
