/* Category pages render website content only from config.js. */
(() => {
  "use strict";
  const config = window.MOLOMON_CONFIG || {};
  const sections = Array.isArray(config.sections) ? config.sections.filter(group => group && /^[a-z][a-z0-9-]*$/.test(group.id)) : [];
  const links = Array.isArray(config.links) ? config.links : [];
  const title = typeof config.title === "string" ? config.title : "Molomon";
  const nav = document.getElementById("category-nav");
  const cards = document.getElementById("category-cards");
  const params = new URLSearchParams(location.search);
  const section = params.getAll("section").length === 1 ? sections.find(group => group.id === params.get("section")) : null;
  const icons = {
    watch: ['rect x="3" y="4" width="18" height="14" rx="3"', 'path d="m10 8 5 3-5 3Z"', 'path d="M8 21h8"'],
    talk: ['rect x="3" y="6" width="12" height="12" rx="3"', 'path d="m15 10 6-3v10l-6-3"'],
    chat: ['path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5a8.5 8.5 0 0 1 17 0Z"', 'path d="M7 11h9M7 15h6"'],
    play: ['path d="M7 7h10c3 0 4 3 4.5 7l.5 3c.3 2-2 3-3.5 1l-2-2h-9l-2 2c-1.5 2-3.8 1-3.5-1l.5-3C3 10 4 7 7 7Z"', 'path d="M6 11v4M4 13h4M16 11h.01M19 14h.01"'],
    cards: ['rect x="7" y="3" width="13" height="18" rx="2"', 'path d="M7 19H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2"', 'path d="m13.5 8 3 4-3 4-3-4Z"'],
    music: ['path d="M9 18V5l12-2v13M9 8l12-2"', 'ellipse cx="6" cy="18" rx="3" ry="3"', 'ellipse cx="18" cy="16" rx="3" ry="3"'],
    spark: ['path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"', 'path d="M21 2v4M19 4h4"'],
    bookmark: ['path d="M6 3h12v18l-6-4-6 4Z"'],
    note: ['path d="M14 3H5v18h14V8Z"', 'path d="M14 3v5h5M8 12h8M8 16h5"'],
    photo: ['rect x="3" y="3" width="18" height="18" rx="3"', 'circle cx="8" cy="8" r="1.5"', 'path d="m3 17 6-6 4 4 3-3 5 5"'],
    calendar: ['rect x="3" y="5" width="18" height="16" rx="3"', 'path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"']
  };
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
    // These are fixed local shapes, never configuration markup.
    svg.innerHTML = (icons[name] || icons.bookmark).map(shape => `<${shape}/>`).join("");
    return svg;
  }
  function destination(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!/^(https?:\/\/|\.\/)/i.test(text) || /[\s\\]/.test(text)) return null;
    try {
      const url = new URL(text, document.baseURI);
      const localFilePreview = text.startsWith("./") && location.protocol === "file:" && url.protocol === "file:";
      if ((!localFilePreview && !["https:", "http:"].includes(url.protocol)) || url.username || url.password) return null;
      if (text.startsWith("./")) {
        if (text.includes("?") || text.includes("#") || text.split("/").slice(1).some(part => part === "." || part === "..")) return null;
        const base = new URL("./", document.baseURI);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
      }
      return url.href;
    } catch { return null; }
  }
  function card(link) {
    const url = destination(link.url);
    const article = element("article", `link-card${url ? " available" : " pending"}`);
    const top = element("div", "card-top"), badge = element("span", "card-icon");
    badge.append(icon(link.icon)); top.append(badge);
    if (!url) top.append(element("span", "link-status", "Needs a link"));
    article.append(top, element("h2", "card-title", link.title), element("p", "card-description", link.description));
    if (url) {
      const open = element("a", "open-button", "Open"); open.href = url;
      open.setAttribute("aria-label", `Open ${link.title}`);
      const arrow = element("span", "button-arrow", "→"); arrow.setAttribute("aria-hidden", "true"); open.append(arrow); article.append(open);
    } else { const button = element("button", "open-button", "Coming soon"); button.type = "button"; button.disabled = true; article.append(button); }
    return article;
  }
  document.querySelectorAll("[data-site-title]").forEach(node => { node.textContent = title; });
  document.querySelector(".brand").setAttribute("aria-label", `${title} home`);
  sections.forEach(group => {
    const link = element("a", "nav-link", group.name); link.href = `./category.html?section=${encodeURIComponent(group.id)}`;
    if (group === section) link.setAttribute("aria-current", "page"); nav.append(link);
  });
  if (!section) { document.title = `Categories · ${title}`; return; }
  document.title = `${section.name} · ${title}`;
  document.getElementById("category-title").textContent = section.name;
  document.getElementById("category-description").textContent = section.description;
  const selected = links.filter(link => link && link.section === section.id);
  selected.forEach(link => cards.append(card(link)));
  if (!selected.length) cards.append(element("p", "empty-category", "No websites added yet."));
})();
