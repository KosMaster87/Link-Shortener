// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from "prism-react-renderer";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Link Shortener",
  tagline: "API-Dokumentation für den Link Shortener",
  favicon: "img/favicon.ico",

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: "https://link-shortener.dev2k.org",
  baseUrl: "/",

  onBrokenLinks: "throw",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    [
      "docusaurus-plugin-typedoc",
      {
        entryPoints: [
          "../server.js",
          "../src/db/index.js",
          "../src/routes/analytics.js",
          "../src/routes/auth.js",
          "../src/routes/dashboard.js",
          "../src/routes/links.js",
          "../src/routes/redirect.js",
          "../src/middleware/auth.js",
          "../src/services/analytics-service.js",
          "../src/services/auth-service.js",
          "../src/services/dashboard-service.js",
          "../src/services/link-service.js",
          "../src/utils/jwt.js",
          "../src/utils/rate-limit.js",
          "../src/utils/result.js",
          "../src/utils/validators.js",
        ],
        tsconfig: "../jsconfig.json",
        disableSources: true,
        out: "docs/api",
      },
    ],
  ],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: "./sidebars.js",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: "img/docusaurus-social-card.jpg",
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: "Link Shortener",
        logo: {
          alt: "Link Shortener Logo",
          src: "img/logo.svg",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "tutorialSidebar",
            position: "left",
            label: "Docs",
          },
          {
            to: "/docs/api/modules",
            label: "API",
            position: "left",
          },
          {
            href: "https://github.com/dev2k/link-shortener",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Einführung",
                to: "/docs/intro",
              },
              {
                label: "API Referenz",
                to: "/docs/api/modules",
              },
            ],
          },
          {
            title: "Projekt",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/dev2k/link-shortener",
              },
              {
                label: "dev2k.org",
                href: "https://dev2k.org",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} dev2k. Erstellt mit Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
