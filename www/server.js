import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const MAX_RESULTS = 12;

const publicFiles = {
  "/": {
    file: "index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/index.html": {
    file: "index.html",
    contentType: "text/html; charset=utf-8"
  },
  "/style.css": {
    file: "style.css",
    contentType: "text/css; charset=utf-8"
  },
  "/script.js": {
    file: "script.js",
    contentType: "text/javascript; charset=utf-8"
  }
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function handleSearch(url, request, response) {
  const query = (url.searchParams.get("q") || "").trim();
  const pageToken = (url.searchParams.get("pageToken") || "").trim();
  const apiKey = request.headers["x-youtube-api-key"];

  if (!query) {
    sendJson(response, 400, { error: "Masukkan kata kunci pencarian." });
    return;
  }

  if (query.length > 100) {
    sendJson(response, 400, { error: "Kata kunci maksimal 100 karakter." });
    return;
  }

  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 256) {
    sendJson(response, 400, { error: "API key YouTube tidak valid atau belum diisi." });
    return;
  }

  if (pageToken.length > 500) {
    sendJson(response, 400, { error: "Token halaman tidak valid." });
    return;
  }

  const parameters = new URLSearchParams({
    part: "snippet",
    q: query,
    maxResults: String(MAX_RESULTS),
    type: "video",
    key: apiKey.trim()
  });

  if (pageToken) {
    parameters.set("pageToken", pageToken);
  }

  try {
    const youtubeResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${parameters.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );

    let youtubeData;
    try {
      youtubeData = await youtubeResponse.json();
    } catch {
      youtubeData = {};
    }

    if (!youtubeResponse.ok) {
      const apiMessage = youtubeData?.error?.message;
      console.error(
        "YouTube API returned an error:",
        youtubeResponse.status,
        apiMessage || ""
      );

      sendJson(response, 502, {
        error: apiMessage || "YouTube API menolak permintaan pencarian."
      });
      return;
    }

    const items = (Array.isArray(youtubeData.items) ? youtubeData.items : [])
      .filter((item) => item?.id?.videoId && item?.snippet)
      .map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title || "Tanpa judul",
        description: item.snippet.description || "",
        channelTitle: item.snippet.channelTitle || "Kanal YouTube",
        thumbnailUrl:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          ""
      }))
      .filter((item) => item.thumbnailUrl);

    sendJson(response, 200, {
      items,
      nextPageToken: youtubeData.nextPageToken || ""
    });
  } catch (error) {
    console.error("YouTube search request failed:", error);
    sendJson(response, 502, {
      error: "Tidak dapat menghubungi YouTube. Periksa koneksi dan coba lagi."
    });
  }
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  let url;
  try {
    url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  } catch {
    sendJson(response, 400, { error: "Alamat permintaan tidak valid." });
    return;
  }

  if (url.pathname === "/api/search") {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, { error: "Metode permintaan tidak didukung." });
      return;
    }

    await handleSearch(url, request, response);
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method Not Allowed");
    return;
  }

  const publicFile = publicFiles[url.pathname];

  if (!publicFile) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Not Found");
    return;
  }

  try {
    const fileContents = await readFile(
      path.join(projectDirectory, publicFile.file)
    );

    response.writeHead(200, {
      "Content-Type": publicFile.contentType,
      "Cache-Control": "no-cache"
    });
    response.end(fileContents);
  } catch (error) {
    console.error(`Could not read ${publicFile.file}:`, error);
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Gagal membaca file aplikasi.");
  }
});

server.listen(port, () => {
  console.log(`Aplikasi berjalan di http://localhost:${port}`);
});