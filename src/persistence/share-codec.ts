import { deflate, Inflate } from 'pako'
import type { FlowDocument } from '../domain/flow'
import { stringifyFlow, validateFlowDocument } from './flow-codec'

const MAX_FRAGMENT_LENGTH = 120_000
const MAX_DECOMPRESSED_BYTES = 5_000_000
const INFLATE_CHUNK_SIZE = 64 * 1024

class DecompressedSizeLimitError extends Error {
  constructor() {
    super('The share link expands beyond the 5 MB safety limit.')
  }
}

function toUrlSafeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function fromUrlSafeBase64(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(normalized + padding)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function inflateWithLimit(bytes: Uint8Array): Uint8Array {
  const inflator = new Inflate({ chunkSize: INFLATE_CHUNK_SIZE })
  const chunks: Uint8Array[] = []
  let outputLength = 0

  inflator.onData = (chunk) => {
    if (chunk.byteLength > MAX_DECOMPRESSED_BYTES - outputLength) {
      throw new DecompressedSizeLimitError()
    }
    outputLength += chunk.byteLength
    chunks.push(chunk)
  }

  const succeeded = inflator.push(bytes, true)
  if (!succeeded || inflator.err) throw new Error(inflator.msg || 'Invalid compressed data.')

  const output = new Uint8Array(outputLength)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export function encodeFlowFragment(document: FlowDocument): string {
  const bytes = new TextEncoder().encode(stringifyFlow(document))
  const encoded = toUrlSafeBase64(deflate(bytes, { level: 9 }))
  if (encoded.length > MAX_FRAGMENT_LENGTH) throw new Error('This flow is too large for a reliable share link. Export JSON instead.')
  return `state=${encoded}`
}

export function decodeFlowFragment(fragment: string): FlowDocument {
  const encoded = fragment.startsWith('#') ? fragment.slice(1) : fragment
  const value = encoded.startsWith('state=') ? encoded.slice(6) : encoded
  if (!value || value.length > MAX_FRAGMENT_LENGTH) throw new Error('The share link is empty or exceeds the safety limit.')
  try {
    const json = new TextDecoder().decode(inflateWithLimit(fromUrlSafeBase64(value)))
    return validateFlowDocument(JSON.parse(json))
  } catch (error) {
    if (error instanceof DecompressedSizeLimitError) throw error
    if (error instanceof Error && error.message.includes('schema')) throw error
    throw new Error('This share link is damaged or not a Film Stack Simulator v3 link.')
  }
}
