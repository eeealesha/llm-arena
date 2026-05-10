import fs from "fs"
import path from "path"

export interface ModelMeta {
  name: string
  size_gb: number
}

let _cache: ModelMeta[] | null = null

export function getModelMeta(): ModelMeta[] {
  if (_cache) return _cache
  const file = path.join(process.cwd(), "data", "models.json")
  if (!fs.existsSync(file)) return []
  const data = JSON.parse(fs.readFileSync(file, "utf-8"))
  _cache = data.available || []
  return _cache!
}

export function getModelSize(name: string): number | null {
  const meta = getModelMeta().find((m) => m.name === name)
  return meta?.size_gb ?? null
}
