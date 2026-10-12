/* All editable homepage content and destinations live in config.js. */
(() => {
  "use strict";
  const config = window.MOLOMON_CONFIG;
  if (!config || !Array.isArray(config.sections) || !Array.isArray(config.links)) return;
  const icons = {
    watch: '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="m10 8 5 3-5 3Z"/><path d="M8 21h8"/>',
    play: '<path d="M7 7h10c3 0 4 3 4.5 7l.5 3c.3 2-2 3-3.5 1l-2-2h-9l-2 2c-1.5 2-3.8 1-3.5-1l.5-3C3 10 4 7 7 7Z"/><path d="M6 11v4M4 13h4M16 11h.01M19 14h.01"/>',
    music: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
    note: '<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>'
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }).forEach(([key, value]) => svg.setAttribute(key, value));
    svg.innerHTML = icons[name] || icons.bookmark;
    return svg;
  }
  function destination(value) {
    if (typeof value !== "string" || !/^(https?:\/\/|\.\/)/i.test(value.trim())) return null;
    try {
      const url = new URL(value.trim(), document.baseURI);
      return !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function pageLink(url, title, className) {
    const link = document.createElement("a");
    link.className = className;
    link.href = url;
    link.setAttribute("aria-label", `Open ${title}`);
    return link;
  }
  function categoryURL(id) { return `./category.html?section=${encodeURIComponent(id)}`; }
  document.title = config.title;
  document.querySelectorAll("[data-site-title]").forEach(node => { node.textContent = config.title; });
  document.querySelector(".brand").setAttribute("aria-label", `${config.title} home`);
  const secretURL = destination(config.secret?.url);
  if (secretURL) document.querySelector("#snowys-fish").href = secretURL;

  const nav = document.querySelector("#section-nav");
  for (const id of config.secondarySections || []) {
    const group = config.sections.find(section => section.id === id);
    if (!group) continue;
    const link = pageLink(categoryURL(id), group.name, "nav-link");
    link.textContent = group.name;
    nav.append(link);
  }
  const options = (config.homeOptions || []).map(option => {
    if (option.section) {
      const group = config.sections.find(section => section.id === option.section);
      return group ? { title: group.name, icon: option.icon, url: categoryURL(group.id) } : null;
    }
    return config.links.find(link => link.id === option.link);
  }).filter(option => option && destination(option.url));
  const orbitNav = document.querySelector("#orbit-nav");
  options.forEach((option, index) => {
    const link = pageLink(destination(option.url), option.title, "orbit-link");
    const label = document.createElement("span");
    label.textContent = option.title;
    link.append(icon(option.icon), label);
    const angle = (index / options.length * 360 - 90) * Math.PI / 180;
    link.style.setProperty("--x", `${50 + 39 * Math.cos(angle)}%`);
    link.style.setProperty("--y", `${50 + 39 * Math.sin(angle)}%`);
    orbitNav.append(link);
  });
  const count = config.links.filter(link => config.sections.some(group => group.id === link.section) && destination(link.url)).length;
  const summary = document.querySelector("#link-count");
  summary.textContent = `${count} ${count === 1 ? "link" : "links"} ready`;
  summary.hidden = false;

  let partnerNames = Array.isArray(config.partners) ? config.partners.slice(0, 2) : [];
  try {
    const stored = JSON.parse(localStorage.getItem("molomon-names"));
    if (Array.isArray(stored) && stored.every(name => typeof name === "string")) partnerNames = stored.slice(0, 2);
  } catch { /* Browser storage is optional. */ }
  function showNames() {
    const names = document.querySelector("#partners");
    names.textContent = partnerNames.filter(Boolean).join(" & ");
    names.hidden = !names.textContent;
    document.querySelector("#edit-names").firstChild.textContent = names.textContent ? "Edit names " : "Add names ";
  }
  showNames();
  const dialog = document.querySelector("#names-dialog");
  document.querySelector("#edit-names").addEventListener("click", () => {
    document.querySelector("#first-name").value = partnerNames[0] || "";
    document.querySelector("#second-name").value = partnerNames[1] || "";
    dialog.showModal();
  });
  document.querySelector("#cancel-names").addEventListener("click", () => dialog.close());
  document.querySelector("#names-form").addEventListener("submit", event => {
    event.preventDefault();
    partnerNames = [document.querySelector("#first-name").value.trim(), document.querySelector("#second-name").value.trim()];
    try { localStorage.setItem("molomon-names", JSON.stringify(partnerNames)); } catch { /* Keep names for this visit. */ }
    showNames();
    dialog.close();
  });
})();
