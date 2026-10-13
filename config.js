/*
 * Molomon's content. Edit this file to add or change links.
 *
 * partners: optional names displayed under the title. Leave [] to hide them.
 * sections: id is a unique, lowercase anchor; name and description are editable.
 * links: section must match a section id. Keep id unique for each website.
 * url: a complete https:// (or http://) website URL, ./page.html for a local
 *      activity, or null for an unfinished card.
 *      Null, blank, or invalid URLs produce a disabled "Coming soon" button.
 * icon: watch, talk, chat, play, cards, music, spark, bookmark, note, photo, or calendar.
 *
 * This is a public hub. Watchroom opens through a private signed-in launcher.
 * Do not add private invitation tokens or credentials to this file.
 */
window.MOLOMON_CONFIG = {
  title: "Molomon",
  partners: [],
  secret: { message: "I love you", url: "./secret.html" },
  // Public Google OAuth Web client ID. Never put a client secret here.
  // See README.md for the one-time Google Calendar setup.
  calendar: { googleClientId: "604202426876-21avg4s6hvijim44al479bk5ookpolti.apps.googleusercontent.com" },
  // Public Firebase web-app configuration for shared notes. Setup is documented
  // in docs/SHARED_NOTES_SETUP.md. Never add service-account credentials.
  notes: {
    firebase: {
      apiKey: "AIzaSyBxlDiD0tEt1VpmWquj_qTnDC5Dy0P53dU",
      authDomain: "molomon-48e02.firebaseapp.com",
      projectId: "molomon-48e02",
      appId: "1:109945194011:web:eb58996e97c679726b1abe"
    }
  },
  sections: [
    { id: "watch", name: "Watch", description: "Movies and shows." },
    { id: "talk", name: "Talk", description: "Calls and conversations." },
    { id: "play", name: "Play", description: "Games for two." },
    { id: "together", name: "Together", description: "Music and shared activities." },
    { id: "favorites", name: "Favorites", description: "Places to come back to." }
  ],
  // Circles open category pages or an included app. Link options reuse the
  // app's title, icon, and URL below. Secondary categories stay small.
  homeOptions: [
    { section: "watch", icon: "watch" },
    { section: "play", icon: "play" },
    { link: "calendar" },
    { link: "shared-notes" },
    { link: "memories" },
    { section: "together", icon: "music" }
  ],
  secondarySections: ["talk", "favorites"],
  links: [
    {
      id: "watchroom",
      section: "watch",
      title: "Watchroom",
      description: "Open our shared room.",
      icon: "watch",
      url: "./watchroom.html"
    },
    {
      id: "watchlist",
      section: "watch",
      title: "Watchlist",
      description: "Movies and shows for another day.",
      icon: "note",
      url: null
    },
    {
      id: "video-calls",
      section: "talk",
      title: "Video calls",
      description: "Our usual place to call.",
      icon: "talk",
      url: null
    },
    {
      id: "chat",
      section: "talk",
      title: "Chat",
      description: "Messages between calls.",
      icon: "chat",
      url: null
    },
    {
      id: "rummy-500",
      section: "play",
      title: "Rummy 500",
      description: "Our two-player card game.",
      icon: "cards",
      url: "https://solomonmm876.github.io/rummy-500/"
    },
    {
      id: "backgammon",
      section: "play",
      title: "Backgammon",
      description: "Play a game together, near or far.",
      icon: "play",
      url: "./backgammon.html"
    },
    {
      id: "multiplayer-games",
      section: "play",
      title: "Multiplayer games",
      description: "More games to play together.",
      icon: "play",
      url: null
    },
    {
      id: "calendar",
      section: "together",
      title: "Calendar",
      description: "Find a free time across both time zones.",
      icon: "calendar",
      url: "./calendar.html"
    },
    {
      id: "shared-playlist",
      section: "together",
      title: "Shared playlist",
      description: "Music we listen to together.",
      icon: "music",
      url: null
    },
    {
      id: "shared-activities",
      section: "together",
      title: "Shared activities",
      description: "Things to make and do.",
      icon: "spark",
      url: null
    },
    {
      id: "suggestions",
      section: "together",
      title: "Suggestions",
      description: "Request a change to Molomon.",
      icon: "spark",
      url: "./suggestions.html"
    },
    {
      id: "our-space",
      section: "favorites",
      title: "Our space",
      description: "Shared photos, notes, and plans.",
      icon: "photo",
      url: null
    },
    {
      id: "shared-notes",
      section: "favorites",
      title: "Notes",
      description: "Shared notes, lists, and plans.",
      icon: "note",
      url: "./notes.html"
    },
    {
      id: "memories",
      section: "favorites",
      title: "Memories",
      description: "Little notes about our moments together.",
      icon: "bookmark",
      url: "./memories.html"
    },
    {
      id: "favorite-website",
      section: "favorites",
      title: "Favorite website",
      description: "A place we return to often.",
      icon: "bookmark",
      url: null
    }
  ]
};
