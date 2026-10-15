const API_KEY = "AIzaSyCnBJYr7M-PYbSTh04JxF-1SyOwRovaRAQ";

const IS_CAPACITOR =
  Boolean(window.Capacitor) &&
  typeof window.Capacitor.isNativePlatform === "function" &&
  window.Capacitor.isNativePlatform();

const DIRECT_FILE_MODE =
  window.location.protocol === "file:" ||
  window.location.hostname.endsWith(".github.io") ||
  IS_CAPACITOR;

const API_URL = DIRECT_FILE_MODE
  ? "https://www.googleapis.com/youtube/v3/search"
  : "/api/search";

const root = document.documentElement;
const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const searchButton = document.querySelector("#search-button");
const buttonLabel = searchButton.querySelector(".button-label");
const statusMessage = document.querySelector("#status-message");
const resultsGrid = document.querySelector("#results-grid");
const resultsCount = document.querySelector("#results-count");
const loadMoreButton = document.querySelector("#load-more-button");
const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const themeLabel = document.querySelector("#theme-label");

const PLACEHOLDER_KEY = "TEMPEL_API_KEY_DI_SINI";
const MAX_RESULTS = 12;

let currentQuery = "";
let nextPageToken = "";
let shownCount = 0;
let activeController = null;
let requestNumber = 0;

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  root.dataset.theme = nextTheme;

  const isDark = nextTheme === "dark";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Aktifkan light mode" : "Aktifkan dark mode"
  );
  themeIcon.textContent = isDark ? "☀" : "◐";
  themeLabel.textContent = isDark ? "Light mode" : "Dark mode";

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#0c0c0c" : "#ffffff");

  try {
    localStorage.setItem("mytube-theme", nextTheme);
  } catch {
    // Tema tetap berubah untuk sesi ini jika penyimpanan browser tidak tersedia.
  }
}

function setStatus(message, state = "") {
  statusMessage.textContent = message;

  if (state) {
    statusMessage.dataset.state = state;
  } else {
    delete statusMessage.dataset.state;
  }
}

function setLoading(isLoading, isAppending = false) {
  searchButton.disabled = isLoading;
  buttonLabel.textContent = isLoading ? "Mencari..." : "Cari";
  loadMoreButton.disabled = isLoading;
  loadMoreButton.textContent =
    isLoading && isAppending ? "Memuat..." : "Muat lebih banyak";
}

function normalizeVideo(video) {
  if (DIRECT_FILE_MODE) {
    return {
      videoId: video?.id?.videoId,
      title: video?.snippet?.title,
      description: video?.snippet?.description,
      channelTitle: video?.snippet?.channelTitle,
      thumbnailUrl:
        video?.snippet?.thumbnails?.medium?.url ||
        video?.snippet?.thumbnails?.default?.url
    };
  }

  return video;
}

function createVideoCard(video) {
  if (!video?.videoId || !video?.thumbnailUrl) {
    return null;
  }

  const card = document.createElement("article");
  card.className = "video-card";

  const link = document.createElement("a");
  link.className = "video-link";
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute(
    "aria-label",
    `Tonton video: ${video.title || "Video YouTube"}`
  );

  const thumbnailWrap = document.createElement("div");
  thumbnailWrap.className = "video-thumbnail-wrap";

  const thumbnail = document.createElement("img");
  thumbnail.className = "video-thumbnail";
  thumbnail.src = video.thumbnailUrl;
  thumbnail.alt = "";
  thumbnail.loading = "lazy";
  thumbnail.decoding = "async";

  const details = document.createElement("div");
  details.className = "video-details";

  const title = document.createElement("h3");
  title.className = "video-title";
  title.textContent = video.title || "Tanpa judul";

  const channel = document.createElement("p");
  channel.className = "video-channel";
  channel.textContent = video.channelTitle || "Kanal YouTube";

  const description = document.createElement("p");
  description.className = "video-description";
  description.textContent =
    video.description || "Tidak ada deskripsi video.";

  thumbnailWrap.append(thumbnail);
  details.append(title, channel, description);
  link.append(thumbnailWrap, details);
  card.append(link);

  return card;
}

async function searchVideos({ append = false } = {}) {
  const query = append ? currentQuery : input.value.trim();

  if (!query) {
    setStatus("Masukkan kata kunci pencarian terlebih dahulu.", "error");
    input.focus();
    return;
  }

  if (!API_KEY || API_KEY === PLACEHOLDER_KEY) {
    setStatus("Isi API_KEY di bagian atas file script.js.", "error");
    return;
  }

  if (append && !nextPageToken) {
    return;
  }

  activeController?.abort();

  const controller = new AbortController();
  activeController = controller;
  const thisRequest = ++requestNumber;

  if (!append) {
    currentQuery = query;
    nextPageToken = "";
    shownCount = 0;
    resultsGrid.replaceChildren();
    resultsCount.textContent = "";
    loadMoreButton.hidden = true;
  }

  setLoading(true, append);
  setStatus(
    append ? "Memuat video berikutnya..." : "Sedang mencari video...",
    "loading"
  );

  const parameters = new URLSearchParams({
    q: currentQuery,
    maxResults: String(MAX_RESULTS)
  });

  if (DIRECT_FILE_MODE) {
    parameters.set("part", "snippet");
    parameters.set("type", "video");
    parameters.set("key", API_KEY);
  }

  if (append && nextPageToken) {
    parameters.set("pageToken", nextPageToken);
  }

  const options = {
    method: "GET",
    signal: controller.signal
  };

  if (!DIRECT_FILE_MODE) {
    options.headers = {
      "X-YouTube-API-Key": API_KEY
    };
  }

  try {
    const response = await fetch(
      `${API_URL}?${parameters.toString()}`,
      options
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Respons pencarian tidak dapat dibaca.");
    }

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        data?.error ||
        "Pencarian gagal. Periksa API key dan pengaturan YouTube Data API."
      );
    }

    if (thisRequest !== requestNumber) {
      return;
    }

    const rawVideos = Array.isArray(data.items) ? data.items : [];
    const videos = rawVideos.map(normalizeVideo);
    const cards = videos
      .map(createVideoCard)
      .filter((card) => card !== null);

    if (cards.length > 0) {
      resultsGrid.append(...cards);
      shownCount += cards.length;
    }

    nextPageToken = data.nextPageToken || "";
    resultsCount.textContent = shownCount ? `${shownCount} video` : "";
    loadMoreButton.hidden = !nextPageToken;

    if (shownCount === 0) {
      setStatus(`Tidak ada video yang ditemukan untuk "${currentQuery}".`);
    } else {
      setStatus(`Hasil pencarian untuk "${currentQuery}"`);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    if (thisRequest === requestNumber) {
      const message =
        error instanceof TypeError && DIRECT_FILE_MODE
          ? "Gagal menghubungi YouTube. Periksa koneksi internet, API key, dan batasan API key di Google Cloud Console."
          : error.message || "Tidak dapat menghubungi server.";

      setStatus(message, "error");
    }
  } finally {
    if (thisRequest === requestNumber) {
      activeController = null;
      setLoading(false);
    }
  }
}

themeToggle.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchVideos();
});

loadMoreButton.addEventListener("click", () => {
  searchVideos({ append: true });
});

setTheme(root.dataset.theme);