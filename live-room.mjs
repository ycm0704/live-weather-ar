const sampleComments = [
  ["Mina", "晚上好！"],
  ["Jules", "等一个烟花 ✨"],
  ["Kai", "加入了直播间"],
  ["Nora", "这个雨幕好像窗外"],
  ["Alex", "试试笑一下！"],
  ["Leilani", "来给主播点个赞"],
  ["Sam", "画面好有氛围"],
  ["Sora", "加入了直播间"],
];

const gifts = {
  rose: { name: "玫瑰", icon: "🌹" },
  cheer: { name: "喝彩", icon: "🎉" },
  star: { name: "星星", icon: "🌟" },
};

export function initLiveRoom(stage) {
  const room = stage.querySelector(".live-overlay");
  const get = id => room.querySelector("#" + id);
  const follow = get("room-follow");
  const like = get("room-like");
  const gift = get("room-gift");
  const tray = get("room-gift-tray");
  const giftFeed = get("room-gifts");
  const comments = get("room-comments");
  const hearts = get("room-hearts");
  const input = get("room-comment");
  const likesLabel = get("room-likes");
  const viewersLabel = get("room-viewers");
  let likes = 2248;
  let commentIndex = 0;
  let giftIndex = 0;
  let tick = 0;
  let timer;
  let latestGift;

  function addComment(name, message) {
    const row = document.createElement("p");
    const avatar = document.createElement("span");
    avatar.className = "guest-avatar";
    avatar.style.backgroundImage = `url(./avatars/photo-${[...name].reduce((sum, char) => sum + char.codePointAt(0), 0) % 11}.jpg)`;
    avatar.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    const author = document.createElement("b");
    author.textContent = name;
    text.append(author, document.createTextNode(message));
    row.append(avatar, text);
    comments.append(row);
    if (comments.children.length > 4) comments.firstElementChild.remove();
  }

  function addHeart() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const heart = document.createElement("span");
    heart.textContent = "♥";
    heart.style.setProperty("--drift", `${Math.round(Math.random() * 34) - 28}px`);
    heart.style.setProperty("--rise", `${Math.round(Math.random() * 55) + 110}px`);
    heart.style.setProperty("--heart-color", ["#ff456d", "#ffc0d1", "#67ece5"][Math.floor(Math.random() * 3)]);
    hearts.append(heart);
    if (hearts.children.length > 18) hearts.firstElementChild.remove();
    heart.addEventListener("animationend", () => heart.remove(), { once: true });
  }

  function addGift(name, key) {
    if (latestGift?.name === name && latestGift.key === key) {
      latestGift.amount.textContent = "×" + ++latestGift.count;
      return;
    }
    const item = gifts[key];
    const row = document.createElement("div");
    const avatar = document.createElement("span");
    avatar.className = "guest-avatar";
    avatar.style.backgroundImage = `url(./avatars/photo-${[...name].reduce((sum, char) => sum + char.codePointAt(0), 0) % 11}.jpg)`;
    const meta = document.createElement("span");
    const author = document.createElement("b");
    author.textContent = name;
    const message = document.createElement("small");
    message.textContent = "送出" + item.name;
    meta.append(author, message);
    const icon = document.createElement("span");
    icon.className = "gift-emoji";
    icon.textContent = item.icon;
    const amount = document.createElement("strong");
    amount.textContent = "×1";
    row.append(avatar, meta, icon, amount);
    giftFeed.replaceChildren(row);
    latestGift = { name, key, amount, count: 1 };
  }

  function setTray(open, restoreFocus = false) {
    tray.hidden = !open;
    gift.setAttribute("aria-expanded", String(open));
    if (open) tray.querySelector("[data-gift]").focus({ preventScroll: true });
    else if (restoreFocus) gift.focus({ preventScroll: true });
  }

  follow.addEventListener("click", () => {
    const following = follow.getAttribute("aria-pressed") !== "true";
    follow.setAttribute("aria-pressed", String(following));
    follow.textContent = following ? "已关注" : "＋ 关注";
  });
  like.addEventListener("click", () => {
    likesLabel.textContent = (++likes).toLocaleString("en-US");
    addHeart();
  });
  gift.addEventListener("click", () => setTray(tray.hidden));
  get("room-gift-close").addEventListener("click", () => setTray(false, true));
  tray.addEventListener("click", event => {
    const key = event.target.closest("[data-gift]")?.dataset.gift;
    if (!Object.hasOwn(gifts, key)) return;
    addGift("你", key);
    addHeart();
    setTray(false, true);
  });
  room.addEventListener("keydown", event => {
    if (event.key === "Escape" && !tray.hidden) setTray(false, true);
  });
  get("room-comment-form").addEventListener("submit", event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    addComment("你", message);
    input.value = "";
  });

  function simulateAudience() {
    if (document.hidden) return;
    tick++;
    if (tick % 2 === 0) {
      addHeart();
      likesLabel.textContent = (++likes).toLocaleString("en-US");
    }
    if (tick % 4 === 0) addComment(...sampleComments[commentIndex++ % sampleComments.length]);
    if (tick % 5 === 0) viewersLabel.textContent = 108 + [0, 3, 5, 4, 7, 8, 6][(tick / 5) % 7];
    if (tick % 11 === 0) {
      const sample = [["Leilani", "rose"], ["Jules", "star"], ["Mina", "cheer"]];
      addGift(...sample[giftIndex++ % sample.length]);
    }
  }

  for (const comment of sampleComments.slice(0, 3)) addComment(...comment);
  commentIndex = 3;
  addGift("Leilani", "rose");
  giftIndex = 1;
  function syncAudienceTimer() {
    clearInterval(timer);
    if (!document.hidden) timer = setInterval(simulateAudience, 850);
  }
  syncAudienceTimer();
  document.addEventListener("visibilitychange", syncAudienceTimer);
  window.addEventListener("pagehide", () => clearInterval(timer));
  window.addEventListener("pageshow", syncAudienceTimer);
}
