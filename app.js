    const els = {
      fileInput: document.querySelector("#fileInput"),
      dropzone: document.querySelector("#dropzone"),
      ratioPreset: document.querySelector("#ratioPreset"),
      instagramOptimize: document.querySelector("#instagramOptimize"),
      customRatioBox: document.querySelector("#customRatioBox"),
      customW: document.querySelector("#customW"),
      customH: document.querySelector("#customH"),
      outputWidth: document.querySelector("#outputWidth"),
      quality: document.querySelector("#quality"),
      padding: document.querySelector("#padding"),
      paddingValue: document.querySelector("#paddingValue"),
      bgMode: document.querySelector("#bgMode"),
      swatches: document.querySelector("#swatches"),
      colorPicker: document.querySelector("#colorPicker"),
      blurAmount: document.querySelector("#blurAmount"),
      blurValue: document.querySelector("#blurValue"),
      exifEnabled: document.querySelector("#exifEnabled"),
      fontScale: document.querySelector("#fontScale"),
      fontValue: document.querySelector("#fontValue"),
      sharpen: document.querySelector("#sharpen"),
      preserveExif: document.querySelector("#preserveExif"),
      metadataNote: document.querySelector("#metadataNote"),
      downloadBtn: document.querySelector("#downloadBtn"),
      zipBtn: document.querySelector("#zipBtn"),
      prevBtn: document.querySelector("#prevBtn"),
      nextBtn: document.querySelector("#nextBtn"),
      clearBtn: document.querySelector("#clearBtn"),
      statusTitle: document.querySelector("#statusTitle"),
      statusMeta: document.querySelector("#statusMeta"),
      queueCount: document.querySelector("#queueCount"),
      queueList: document.querySelector("#queueList"),
      previewWrap: document.querySelector("#previewWrap"),
      canvas: document.querySelector("#canvas"),
      toast: document.querySelector("#toast")
    };

    const state = {
      items: [],
      activeIndex: -1,
      bgMode: "solid",
      color: "#ffffff",
      renderToken: 0
    };

    function toast(message) {
      els.toast.textContent = message;
      els.toast.classList.add("show");
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
    }

    function ratio() {
      if (els.ratioPreset.value === "custom") {
        return {
          w: Math.max(1, Number(els.customW.value) || 1),
          h: Math.max(1, Number(els.customH.value) || 1)
        };
      }
      const [w, h] = els.ratioPreset.value.split(":").map(Number);
      return { w, h };
    }

    function renderSize() {
      const r = ratio();
      const requestedWidth = Number(els.outputWidth.value) || 1080;
      const width = els.instagramOptimize.checked ? 1080 : Math.max(400, Math.min(4096, requestedWidth));
      return { width, height: Math.round(width * r.h / r.w) };
    }

    function filenameBase(name) {
      return name.replace(/\.[^.]+$/, "").replace(/[^\w가-힣.-]+/g, "_").slice(0, 80) || "exifframe";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function shutterLabel(value) {
      if (!value) return "";
      if (typeof value === "string") return value;
      if (value >= 1) return `${Number(value.toFixed(1))}s`;
      const denom = Math.round(1 / value);
      return `1/${denom}s`;
    }

    function apertureLabel(value) {
      if (!value) return "";
      return `f/${Number(value).toFixed(1).replace(".0", "")}`;
    }

    function focalLabel(value) {
      if (!value) return "";
      return `${Math.round(value)}mm`;
    }

    function isoLabel(value) {
      if (!value) return "";
      return `ISO ${value}`;
    }

    function cleanExifText(value) {
      if (!value) return "";
      const text = Array.isArray(value) ? value.join(" ") : String(value);
      const firstBadChar = text.search(/[\u0000-\u001f\u007f\ufffd]/);
      const sliced = firstBadChar >= 0 ? text.slice(0, firstBadChar) : text;
      return sliced.replace(/\s+/g, " ").trim();
    }

    function formatExif(tags) {
      if (!tags) return { title: "Unknown camera", details: "No EXIF data" };
      const make = cleanExifText(tags.Make);
      const cameraModel = cleanExifText(tags.Model);
      const lens = cleanExifText(tags.LensModel);
      const model = [make, cameraModel].filter(Boolean).join(" ").trim() || lens || "Unknown camera";
      const details = [
        apertureLabel(tags.FNumber || tags.ApertureValue),
        shutterLabel(tags.ExposureTime || tags.ShutterSpeedValue),
        isoLabel(tags.ISO),
        focalLabel(tags.FocalLength)
      ].filter(Boolean).join("  ·  ");
      return {
        title: model.replace(/\s+/g, " "),
        details: [lens, details].filter(Boolean).join("  ·  ") || "No exposure data"
      };
    }

    function isJpeg(file) {
      return file.type === "image/jpeg" || /\.(jpe?g)$/i.test(file.name || "");
    }

    function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }

    function loadImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => resolve({ img, url });
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("이미지를 열 수 없습니다."));
        };
        img.src = url;
      });
    }

    async function readExif(file) {
      try {
        if (!window.exifr) return null;
        return await window.exifr.parse(file, {
          tiff: true,
          exif: true,
          ifd0: true,
          pick: [
            "Make", "Model", "LensModel", "FNumber", "ApertureValue",
            "ExposureTime", "ShutterSpeedValue", "ISO", "FocalLength"
          ]
        });
      } catch {
        return null;
      }
    }

    async function readExifPayload(file) {
      if (!window.piexif || !isJpeg(file)) return null;
      try {
        const dataUrl = await readAsDataUrl(file);
        return window.piexif.load(dataUrl);
      } catch {
        return null;
      }
    }

    function updateExifDescription(exifPayload) {
      if (!exifPayload) return null;
      const cloned = JSON.parse(JSON.stringify(exifPayload));
      const note = els.metadataNote.value.trim();
      if (note) {
        cloned["0th"] = cloned["0th"] || {};
        cloned["0th"][window.piexif.ImageIFD.ImageDescription] = note;
      }
      delete cloned.thumbnail;
      return cloned;
    }

    async function addFiles(files) {
      const imageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
      if (!imageFiles.length) {
        toast("이미지 파일을 선택해 주세요.");
        return;
      }

      for (const file of imageFiles) {
        try {
          const [{ img, url }, exif, exifPayload] = await Promise.all([
            loadImage(file),
            readExif(file),
            readExifPayload(file)
          ]);
          state.items.push({
            file,
            img,
            url,
            exif,
            exifPayload,
            name: file.name,
            width: img.naturalWidth,
            height: img.naturalHeight
          });
        } catch (error) {
          toast(error.message);
        }
      }

      if (state.activeIndex === -1 && state.items.length) state.activeIndex = 0;
      updateQueue();
      renderActive();
    }

    function updateQueue() {
      els.queueCount.textContent = `${state.items.length} file${state.items.length === 1 ? "" : "s"}`;
      els.queueList.innerHTML = "";
      state.items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = `thumb${index === state.activeIndex ? " active" : ""}`;
        row.role = "button";
        row.tabIndex = 0;
        const safeName = escapeHtml(item.name);
        row.innerHTML = `
          <img src="${item.url}" alt="">
          <span>
            <strong>${safeName}</strong>
            <span>${item.width} x ${item.height}</span>
          </span>
          <button class="thumb-delete" type="button" title="삭제" aria-label="${safeName} 삭제">
            <i data-lucide="x"></i>
          </button>
        `;
        row.addEventListener("click", () => {
          state.activeIndex = index;
          updateQueue();
          renderActive();
        });
        row.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            state.activeIndex = index;
            updateQueue();
            renderActive();
          }
        });
        row.querySelector(".thumb-delete").addEventListener("click", event => {
          event.stopPropagation();
          removeQueueItem(index);
        });
        els.queueList.appendChild(row);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    function removeQueueItem(index) {
      const [removed] = state.items.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);

      if (!state.items.length) {
        state.activeIndex = -1;
      } else if (state.activeIndex === index) {
        state.activeIndex = Math.min(index, state.items.length - 1);
      } else if (state.activeIndex > index) {
        state.activeIndex -= 1;
      }

      updateQueue();
      renderActive();
    }

    function drawCover(ctx, img, x, y, w, h) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    function drawContain(ctx, img, x, y, w, h) {
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      return { x: dx, y: dy, w: dw, h: dh };
    }

    function averageColor(img) {
      const sample = document.createElement("canvas");
      const ctx = sample.getContext("2d", { willReadFrequently: true });
      sample.width = 24;
      sample.height = 24;
      ctx.drawImage(img, 0, 0, 24, 24);
      const data = ctx.getImageData(0, 0, 24, 24).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const count = data.length / 4;
      const mix = c => Math.round((c / count) * 0.34 + 255 * 0.66);
      return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }

    function applySharpen(canvas) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const { width, height } = canvas;
      const src = ctx.getImageData(0, 0, width, height);
      const out = ctx.createImageData(width, height);
      const s = src.data;
      const d = out.data;
      const kernel = [0, -0.18, 0, -0.18, 1.72, -0.18, 0, -0.18, 0];

      d.set(s);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let value = 0;
            let k = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                value += s[((y + ky) * width + (x + kx)) * 4 + c] * kernel[k++];
              }
            }
            d[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, value));
          }
          d[(y * width + x) * 4 + 3] = s[(y * width + x) * 4 + 3];
        }
      }
      ctx.putImageData(out, 0, 0);
    }

    function drawExif(ctx, item, size, contentArea) {
      if (!els.exifEnabled.checked) return;
      const exif = formatExif(item.exif);
      const scale = Number(els.fontScale.value) / 100;
      const titleSize = Math.max(16, Math.round(size.width * 0.022 * scale));
      const detailSize = Math.max(12, Math.round(size.width * 0.015 * scale));
      const y = contentArea.y + contentArea.h + (size.height - contentArea.y - contentArea.h) * 0.5;
      const darkBackground = state.bgMode === "solid" && state.color.toLowerCase() === "#111111";

      ctx.save();
      ctx.fillStyle = darkBackground ? "rgba(255,255,255,0.92)" : "rgba(34,32,29,0.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
      ctx.fillText(exif.title, size.width / 2, y - detailSize * 0.75, size.width * 0.86);
      ctx.fillStyle = darkBackground ? "rgba(255,255,255,0.68)" : "rgba(34,32,29,0.62)";
      ctx.font = `500 ${detailSize}px Inter, system-ui, sans-serif`;
      ctx.fillText(exif.details, size.width / 2, y + titleSize * 0.8, size.width * 0.86);
      ctx.restore();
    }

    async function renderItem(item, targetCanvas = els.canvas) {
      const size = renderSize();
      targetCanvas.width = size.width;
      targetCanvas.height = size.height;
      const ctx = targetCanvas.getContext("2d");
      const padding = size.width * (Number(els.padding.value) / 100);
      const footer = els.exifEnabled.checked ? size.height * 0.115 : padding;
      const contentArea = {
        x: padding,
        y: padding,
        w: size.width - padding * 2,
        h: size.height - padding - footer
      };

      ctx.clearRect(0, 0, size.width, size.height);

      if (state.bgMode === "blur") {
        ctx.save();
        ctx.filter = `blur(${Number(els.blurAmount.value)}px) saturate(1.08)`;
        drawCover(ctx, item.img, -padding * 2, -padding * 2, size.width + padding * 4, size.height + padding * 4);
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(0, 0, size.width, size.height);
      } else {
        ctx.fillStyle = state.bgMode === "auto" ? averageColor(item.img) : state.color;
        ctx.fillRect(0, 0, size.width, size.height);
      }

      drawContain(ctx, item.img, contentArea.x, contentArea.y, contentArea.w, contentArea.h);
      drawExif(ctx, item, size, contentArea);
      if (els.sharpen.checked) applySharpen(targetCanvas);
      return targetCanvas;
    }

    async function renderActive() {
      const token = ++state.renderToken;
      const item = state.items[state.activeIndex];
      if (!item) {
        els.canvas.hidden = true;
        els.canvas.style.width = "";
        els.canvas.style.height = "";
        els.statusTitle.textContent = "프레임 대기 중";
        els.statusMeta.textContent = "브라우저 안에서만 처리됩니다.";
        updateQueue();
        return;
      }

      els.statusTitle.textContent = item.name;
      els.statusMeta.textContent = `${item.width} x ${item.height}`;
      await renderItem(item, els.canvas);
      if (token !== state.renderToken) return;
      els.canvas.hidden = false;
      requestAnimationFrame(fitCanvasToPreview);
    }

    function canvasToBlob(canvas) {
      const quality = Math.max(0.5, Math.min(1, Number(els.quality.value) / 100));
      return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    }

    async function outputBlob(canvas, item) {
      const blob = await canvasToBlob(canvas);
      if (!els.preserveExif.checked || !item.exifPayload || !window.piexif) return blob;
      try {
        const dataUrl = await readAsDataUrl(blob);
        const exifPayload = updateExifDescription(item.exifPayload);
        const exifBytes = window.piexif.dump(exifPayload);
        const inserted = window.piexif.insert(exifBytes, dataUrl);
        const response = await fetch(inserted);
        return await response.blob();
      } catch {
        toast("EXIF 보존에 실패해 이미지로만 저장합니다.");
        return blob;
      }
    }

    function downloadBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 600);
    }

    async function downloadActive() {
      const item = state.items[state.activeIndex];
      if (!item) {
        toast("저장할 사진이 없습니다.");
        return;
      }
      await renderItem(item, els.canvas);
      const blob = await outputBlob(els.canvas, item);
      downloadBlob(blob, `${filenameBase(item.name)}_framed.jpg`);
    }

    async function downloadZip() {
      if (!state.items.length) {
        toast("묶을 사진이 없습니다.");
        return;
      }
      if (!window.JSZip) {
        toast("ZIP 라이브러리를 불러오지 못했습니다.");
        return;
      }

      els.zipBtn.disabled = true;
      els.zipBtn.textContent = "처리 중";
      try {
        const zip = new JSZip();
        const offscreen = document.createElement("canvas");
        for (let i = 0; i < state.items.length; i++) {
          els.statusMeta.textContent = `${i + 1} / ${state.items.length} 변환 중`;
          await renderItem(state.items[i], offscreen);
          const blob = await outputBlob(offscreen, state.items[i]);
          zip.file(`${String(i + 1).padStart(2, "0")}_${filenameBase(state.items[i].name)}_framed.jpg`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "ExifFrame_exports.zip");
        renderActive();
      } finally {
        els.zipBtn.disabled = false;
        els.zipBtn.innerHTML = '<i data-lucide="archive"></i> ZIP';
        if (window.lucide) window.lucide.createIcons();
      }
    }

    function setBgMode(mode) {
      state.bgMode = mode;
      els.bgMode.querySelectorAll("button").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === mode);
      });
      renderActive();
    }

    function setColor(color) {
      state.color = color;
      els.colorPicker.value = color;
      els.swatches.querySelectorAll(".swatch").forEach(button => {
        button.classList.toggle("active", button.dataset.color.toLowerCase() === color.toLowerCase());
      });
      if (state.bgMode !== "solid") setBgMode("solid");
      renderActive();
    }

    function syncOptimizeControl() {
      els.outputWidth.disabled = els.instagramOptimize.checked;
      if (els.instagramOptimize.checked) els.outputWidth.value = 1080;
    }

    function fitCanvasToPreview() {
      if (els.canvas.hidden || !els.canvas.width || !els.canvas.height) return;

      const wrapStyle = getComputedStyle(els.previewWrap);
      const horizontalPadding = parseFloat(wrapStyle.paddingLeft) + parseFloat(wrapStyle.paddingRight);
      const verticalPadding = parseFloat(wrapStyle.paddingTop) + parseFloat(wrapStyle.paddingBottom);
      const availableWidth = Math.max(1, els.previewWrap.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, els.previewWrap.clientHeight - verticalPadding);
      const scale = Math.min(availableWidth / els.canvas.width, availableHeight / els.canvas.height);

      els.canvas.style.width = `${Math.floor(els.canvas.width * scale)}px`;
      els.canvas.style.height = `${Math.floor(els.canvas.height * scale)}px`;
    }

    function bindEvents() {
      els.fileInput.addEventListener("change", event => addFiles(event.target.files));

      ["dragenter", "dragover"].forEach(type => {
        els.dropzone.addEventListener(type, event => {
          event.preventDefault();
          els.dropzone.classList.add("dragging");
        });
      });

      ["dragleave", "drop"].forEach(type => {
        els.dropzone.addEventListener(type, event => {
          event.preventDefault();
          els.dropzone.classList.remove("dragging");
        });
      });

      els.dropzone.addEventListener("drop", event => addFiles(event.dataTransfer.files));

      [
        els.ratioPreset, els.customW, els.customH, els.outputWidth, els.quality,
        els.exifEnabled, els.sharpen, els.instagramOptimize
      ].forEach(input => input.addEventListener("input", () => {
        els.customRatioBox.hidden = els.ratioPreset.value !== "custom";
        syncOptimizeControl();
        renderActive();
      }));

      els.padding.addEventListener("input", () => {
        els.paddingValue.textContent = els.padding.value;
        renderActive();
      });

      els.blurAmount.addEventListener("input", () => {
        els.blurValue.textContent = els.blurAmount.value;
        renderActive();
      });

      els.fontScale.addEventListener("input", () => {
        els.fontValue.textContent = els.fontScale.value;
        renderActive();
      });

      els.bgMode.addEventListener("click", event => {
        const button = event.target.closest("button[data-mode]");
        if (button) setBgMode(button.dataset.mode);
      });

      els.swatches.addEventListener("click", event => {
        const button = event.target.closest(".swatch");
        if (button) setColor(button.dataset.color);
      });

      els.colorPicker.addEventListener("input", event => setColor(event.target.value));

      els.downloadBtn.addEventListener("click", downloadActive);
      els.zipBtn.addEventListener("click", downloadZip);

      els.prevBtn.addEventListener("click", () => {
        if (!state.items.length) return;
        state.activeIndex = (state.activeIndex - 1 + state.items.length) % state.items.length;
        updateQueue();
        renderActive();
      });

      els.nextBtn.addEventListener("click", () => {
        if (!state.items.length) return;
        state.activeIndex = (state.activeIndex + 1) % state.items.length;
        updateQueue();
        renderActive();
      });

      els.clearBtn.addEventListener("click", () => {
        state.items.forEach(item => URL.revokeObjectURL(item.url));
        state.items = [];
        state.activeIndex = -1;
        els.fileInput.value = "";
        els.canvas.style.width = "";
        els.canvas.style.height = "";
        updateQueue();
        renderActive();
      });

      window.addEventListener("resize", fitCanvasToPreview);
      if (window.ResizeObserver) {
        const previewObserver = new ResizeObserver(fitCanvasToPreview);
        previewObserver.observe(els.previewWrap);
      }
    }

    window.addEventListener("DOMContentLoaded", () => {
      bindEvents();
      syncOptimizeControl();
      if (window.lucide) window.lucide.createIcons();
    });
