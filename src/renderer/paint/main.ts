// 昔漣的創作工作台 (NovelAI 繪圖) 控制器

document.addEventListener("DOMContentLoaded", () => {
  // DOM 元素獲取
  const tabs = document.querySelectorAll(".panel-tab");
  const panes = document.querySelectorAll(".tab-pane");
  const creationParamsEl = document.getElementById("creation-params") as HTMLTextAreaElement;
  const buildPromptBtn = document.getElementById("build-prompt-btn") as HTMLButtonElement;
  const novelaiPromptEl = document.getElementById("novelai-prompt") as HTMLTextAreaElement;
  const pipelineSelect = document.getElementById("pipeline-select") as HTMLSelectElement;
  const clothingSelect = document.getElementById("clothing-select") as HTMLSelectElement;
  const modelInput = document.getElementById("model-input") as HTMLInputElement;
  const widthSelect = document.getElementById("width-select") as HTMLSelectElement;
  const heightSelect = document.getElementById("height-select") as HTMLSelectElement;
  const generateBtn = document.getElementById("generate-btn") as HTMLButtonElement;
  
  // 連接設定
  const naiTokenEl = document.getElementById("nai-token") as HTMLInputElement;
  const naiUrlEl = document.getElementById("nai-url") as HTMLInputElement;
  const saveConnBtn = document.getElementById("save-conn-btn") as HTMLButtonElement;
  const connStatusLabel = document.getElementById("conn-status-label") as HTMLDivElement;

  // 畫布顯示與載入
  const canvasTitle = document.getElementById("canvas-title") as HTMLSpanElement;
  const metaResolution = document.getElementById("meta-resolution") as HTMLSpanElement;
  const metaModel = document.getElementById("meta-model") as HTMLSpanElement;
  const viewDetailsBtn = document.getElementById("view-details-btn") as HTMLButtonElement;
  const promptDrawer = document.getElementById("prompt-drawer") as HTMLDivElement;
  const finalPromptPreview = document.getElementById("final-prompt-preview") as HTMLPreElement;
  const displayImage = document.getElementById("display-image") as HTMLImageElement;
  const canvasLoader = document.getElementById("canvas-loader") as HTMLDivElement;
  const loaderText = document.getElementById("loader-text") as HTMLDivElement;
  
  // 任務列表
  const tasksCount = document.getElementById("tasks-count") as HTMLSpanElement;
  const tasksList = document.getElementById("tasks-list") as HTMLDivElement;

  let taskHistory: Array<{ id: string; prompt: string; status: "loading" | "done" | "failed"; time: string }> = [
    {
      id: "task-1",
      prompt: "1girl, solo, seele (honkai), pink hair, blue eyes, hair flower, white t-shirt, black pantyhose, holding cup",
      status: "done",
      time: "21:45:19"
    }
  ];

  // 1. 初始化頁面 & 載入連接設定
  const loadConnectionSettings = () => {
    const savedToken = localStorage.getItem("nai_token") || "";
    const savedUrl = localStorage.getItem("nai_url") || "https://image.novelai.net";
    
    naiTokenEl.value = savedToken;
    naiUrlEl.value = savedUrl;
    
    if (savedToken) {
      connStatusLabel.textContent = "已成功連接至 NovelAI API 🟢";
      connStatusLabel.style.color = "#10b981";
    } else {
      connStatusLabel.textContent = "已使用本地模擬模式 (未連接 Token 時將採用展示模式)";
      connStatusLabel.style.color = "";
    }
  };

  loadConnectionSettings();

  const updatePipelineUi = () => {
    const pipeline = pipelineSelect ? pipelineSelect.value : "free";
    const headerTitle = document.getElementById("header-pipeline-title");
    const promptLabel = document.getElementById("prompt-label");
    
    if (pipeline === "free") {
      if (headerTitle) headerTitle.textContent = "AI 繪圖";
      if (promptLabel) promptLabel.textContent = "免費繪圖 Prompt";
      if (buildPromptBtn) buildPromptBtn.textContent = "✨ 構建 繪圖 Prompt";
      modelInput.value = "Flux (Pollinations AI)";
      modelInput.disabled = true;
    } else {
      if (headerTitle) headerTitle.textContent = "NovelAI 官方繪圖";
      if (promptLabel) promptLabel.textContent = "NovelAI Prompt";
      if (buildPromptBtn) buildPromptBtn.textContent = "✨ 構建 NovelAI Prompt";
      modelInput.value = "nai-diffusion-4-5-full";
      modelInput.disabled = false;
    }
  };

  if (pipelineSelect) {
    pipelineSelect.addEventListener("change", updatePipelineUi);
  }
  updatePipelineUi();

  // 保存設定
  saveConnBtn.addEventListener("click", () => {
    localStorage.setItem("nai_token", naiTokenEl.value.trim());
    localStorage.setItem("nai_url", naiUrlEl.value.trim());
    loadConnectionSettings();
    alert("連接設定已保存！");
  });

  // 2. 左側選單切換
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      panes.forEach((p) => p.classList.remove("is-active"));

      tab.classList.add("is-active");
      const targetTab = tab.getAttribute("data-panel-tab");
      const targetPane = document.getElementById(`pane-${targetTab}`);
      if (targetPane) targetPane.classList.add("is-active");
    });
  });

  // 3. 構建 NovelAI Prompt (調用 LLM 翻譯/提取標籤)
  buildPromptBtn.addEventListener("click", async () => {
    const desc = creationParamsEl.value.trim();
    if (!desc) {
      alert("請先輸入創作參數描述喔！");
      return;
    }

    buildPromptBtn.disabled = true;
    buildPromptBtn.textContent = "✨ 昔漣正在分析提示詞...";

    try {
      // 呼叫預留的 paint.buildPrompt IPC
      if ((window as any).paint?.buildPrompt) {
        const result = await (window as any).paint.buildPrompt(desc);
        if (result) {
          novelaiPromptEl.value = result.trim();
        } else {
          novelaiPromptEl.value = "1girl, solo, seele (honkai), pink hair, blue eyes, hair flower";
        }
      } else {
        // 降級 Mock
        setTimeout(() => {
          novelaiPromptEl.value = "1girl, solo, seele (honkai), pink hair, blue eyes, hair flower, white t-shirt, black pantyhose, holding cup, cup focus, soles, detailed background, masterpiece";
        }, 1000);
      }
    } catch (err) {
      console.error(err);
      novelaiPromptEl.value = "1girl, solo, seele (honkai), pink hair, blue eyes, hair flower";
    } finally {
      setTimeout(() => {
        buildPromptBtn.disabled = false;
        buildPromptBtn.textContent = "✨ 構建 NovelAI Prompt";
      }, 500);
    }
  });

  // 4. 查看完整提示詞摺疊抽屜
  viewDetailsBtn.addEventListener("click", () => {
    promptDrawer.classList.toggle("is-open");
    viewDetailsBtn.textContent = promptDrawer.classList.contains("is-open")
      ? "隱藏完整提示詞與參數"
      : "查看完整提示詞與參數";
  });

  // 5. 渲染任務列表
  const renderTasks = () => {
    tasksCount.textContent = `${taskHistory.length} 項`;
    tasksList.innerHTML = "";
    
    taskHistory.forEach((task) => {
      const item = document.createElement("div");
      item.className = "task-item";
      
      const statusText = task.status === "done" ? "已完成" : task.status === "failed" ? "失敗" : "生成中";
      const statusClass = `task-item__status--${task.status}`;
      
      item.innerHTML = `
        <div class="task-item__prompt" title="${task.prompt}">${task.prompt}</div>
        <div class="task-item__right">
          <span class="task-item__status ${statusClass}">${statusText}</span>
          <span class="task-item__time">${task.time}</span>
        </div>
      `;
      
      tasksList.appendChild(item);
    });
  };

  renderTasks();

  // 6. 生成圖像邏輯
  generateBtn.addEventListener("click", async () => {
    const userPrompt = novelaiPromptEl.value.trim();
    if (!userPrompt) {
      alert("請先構建或輸入 NovelAI Prompt 標籤！");
      return;
    }

    const token = localStorage.getItem("nai_token") || "";
    const model = modelInput.value.trim() || "nai-diffusion-4-5-full";
    const width = Number(widthSelect.value);
    const height = Number(heightSelect.value);
    const clothing = clothingSelect.value;

    // 拼裝人物固定特徵
    let finalPrompt = "masterpiece, best quality, " + userPrompt;
    let clothingName = "未選擇服裝";

    if (clothing === "default") {
      finalPrompt += ", seele (honkai), pink hair, blue eyes, hair flower, white t-shirt, black pantyhose, tights, holding cup";
      clothingName = "昔漣日常套";
    } else if (clothing === "wedding") {
      finalPrompt += ", seele (honkai), pink hair, blue eyes, hair flower, wedding dress, purple accents, crystal chestpiece";
      clothingName = "昔漣婚紗套";
    } else if (clothing === "swimsuit") {
      finalPrompt += ", seele (honkai), pink hair, blue eyes, hair flower, bikini, summer beach, smiling";
      clothingName = "昔漣泳裝套";
    } else {
      finalPrompt += ", seele (honkai), pink hair, blue eyes, hair flower";
    }

    // 更新 Canvas UI
    canvasTitle.textContent = `AI 繪圖 · ${clothingName}`;
    metaResolution.textContent = `${width}x${height}`;
    metaModel.textContent = model;
    finalPromptPreview.textContent = finalPrompt;

    // 添加到任務歷史
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newTaskId = `task-${Date.now()}`;
    
    taskHistory.unshift({
      id: newTaskId,
      prompt: finalPrompt,
      status: "loading",
      time: timeStr
    });
    
    renderTasks();

    // 顯示 Loading
    canvasLoader.classList.add("is-loading");
    loaderText.textContent = "昔漣正在為您繪製中...";
    generateBtn.disabled = true;

    try {
      const pipeline = pipelineSelect ? pipelineSelect.value : "free";

      if (pipeline === "free") {
        loaderText.textContent = "正在透過免費通道生成全新影像...";
        if ((window as any).paint?.generateFreeImage) {
          const base64Url = await (window as any).paint.generateFreeImage({
            prompt: finalPrompt,
            width,
            height
          });
          displayImage.src = base64Url;
          const task = taskHistory.find(t => t.id === newTaskId);
          if (task) task.status = "done";
        } else {
          throw new Error("免費繪圖 API 未啟用，請重啟客戶端。");
        }
        return;
      }

      if (!token) {
        // 本地模擬演示模式
        await new Promise((resolve) => setTimeout(resolve, 2500));
        displayImage.src = "/avatars/cyrene-painting-placeholder.jpg";
        
        // 更新歷史狀態為完成
        const task = taskHistory.find(t => t.id === newTaskId);
        if (task) task.status = "done";
      } else {
        // 調用真實的 NovelAI API
        if ((window as any).paint?.generateImage) {
          loaderText.textContent = "正在發送請求至 NovelAI 伺服器...";
          const base64Url = await (window as any).paint.generateImage({
            prompt: finalPrompt,
            model,
            width,
            height,
            token
          });
          
          displayImage.src = base64Url;
          
          const task = taskHistory.find(t => t.id === newTaskId);
          if (task) task.status = "done";
        } else {
          throw new Error("繪圖 API 連接失敗，請重啟客戶端。");
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`生成失敗: ${err?.message || err}`);
      const task = taskHistory.find(t => t.id === newTaskId);
      if (task) task.status = "failed";
    } finally {
      canvasLoader.classList.remove("is-loading");
      generateBtn.disabled = false;
      renderTasks();
    }
  });
});
