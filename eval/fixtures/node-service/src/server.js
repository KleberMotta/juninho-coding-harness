import http from "node:http"
import { add } from "./math.js"

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

function parseNumbers(url) {
  const a = Number(url.searchParams.get("a"))
  const b = Number(url.searchParams.get("b"))
  return { a, b }
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost")

    if (req.method === "GET" && url.pathname === "/add") {
      const { a, b } = parseNumbers(url)
      sendJson(res, 200, { result: add(a, b) })
      return
    }

    sendJson(res, 404, { error: "not_found" })
  })
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3000)
  createServer().listen(port, () => {
    process.stdout.write(`listening on ${port}\n`)
  })
}
