// A light wrapper for speedrun.com API functionality we're using.
// Subject to frequent change; not appropriate for general use.

import { compareAll, compareDefault, nProps } from "/assets/bester/utils.js";
import { extraRuns } from "/assets/data/runs.js";
import { fetch } from "/assets/bester/deps.js";

export const speedrunDotComApiRootUrl = "/api/v1/";

export const api = async (path, maxPages = 128) => {
  if (!apiCache.has(path)) {
    const result = apiFetch(path, maxPages).then(null, error => {
      apiCache.delete(path);
      throw error;
    });
    apiCache.set(path, result);
    return await result;
  } else {
    return await apiCache.get(path);
  }
};

export const apiCache = new Map();

const apiFetch = async (
  path,
  maxPages = Infinity,
  pastPages = 0,
  offset = 0,
) => {
  if (pastPages >= maxPages) {
    throw new Error(
      `got too many results for ${path} (more than ${maxPages} pages/${offset} items)`,
    );
  }
  const url =
    speedrunDotComApiRootUrl +
    path +
    (offset ? `${path.includes("?") ? "&" : "?"}offset=${offset}` : "");
  const response = await fetch(url);
  const body = await response.json();
  if (body.status) {
    throw new Error(`${body.status}: ${body.message}`);
  } else {
    const { data } = body;
    if (
      body.pagination &&
      body.pagination.links &&
      body.pagination.links.filter(l => l.rel === "next").length
    ) {
      const rest = await apiFetch(
        path,
        maxPages,
        pastPages + 1,
        offset + body.pagination.max,
      );
      return data.concat(rest);
    } else {
      return data;
    }
  }
};

export class Runner {
  constructor(...args) {
    this.ℹ️ = this.constructor.name;
    this.isUser = this.userId = this.nick = this.url = void this;
    Object.seal(this);
    Object.assign(this, ...args);
  }

  static fromApiData(runner) {
    if (runner.rel === "user") {
      return new Runner({
        isUser: true,
        userId: runner.id,
        nick: runner.names.international,
        url: runner.weblink,
      });
    } else {
      return new Runner({
        nick: runner.name,
        isUser: false,
      });
    }
  }

  static async getGamesAndLevels(slug) {
    const gameSlugs = new Set();
    const levelSlugs = new Set();

    const data = await api(`users/${slug}/personal-bests`);
    for (const { run } of data) {
      gameSlugs.add(run.game);
      if (run.level && run.category) {
        levelSlugs.add(`${run.category}-${run.level}`);
      } else if (run.level) {
        levelSlugs.add(run.level);
      } else if (run.category) {
        levelSlugs.add(run.category);
      }
    }

    return { gameSlugs: [...gameSlugs], levelSlugs: [...levelSlugs] };
  }
}

export class Game {
  constructor(...args) {
    this.ℹ️ = this.constructor.name;
    this.gameId = this.nick = this.slug = this.url = this.icon = this.categoryLevelPairs = void this;
    Object.seal(this);
    Object.assign(this, ...args);
  }

  static async get(slug) {
    const data = await api(`games/${slug}?embed=categories,levels`);

    const levelCategories = data.categories.data.filter(
      c => c.type === "per-level",
    );
    const gameCategories = data.categories.data.filter(
      c => c.type === "per-game",
    );

    const categoryLevelPairs = [
      ...gameCategories.map(
        category =>
          new CategoryLevelPair({
            gameId: this.gameId,
            levelId: null,
            levelNick: null,
            categoryId: category.id,
            categoryNick: category.name,
            nick: `${category.name}`,
            url: category.weblink,
          }),
      ),
      ...[].concat(
        ...data.levels.data.map(level =>
          levelCategories.map(
            category =>
              new CategoryLevelPair({
                gameId: this.gameId,
                levelId: level.id,
                levelNick: level.name,
                categoryId: category.id,
                categoryNick: category.name,
                nick: `${level.name} (${category.name})`,
                url: level.weblink,
              }),
          ),
        ),
      ),
    ];

    return new Game({
      gameId: data.id,
      nick: data.names.international,
      url: data.weblink,
      icon: data.assets.icon.uri,
      slug: data.abbreviation || data.id,
      categoryLevelPairs,
    });
  }

  async runsByCategoryLevelPairs() {
    const runsData = await api(
      `runs?game=${this.gameId}&orderby=date&direction=asc&max=200&embed=players`,
    );

    // we request all runs, so we can include unverified runs (heh), so we filter out rejected later:
    const runs = await Promise.all(
      runsData
        .filter(data => (data.status && data.status.status) !== "rejected")
        .map(Run.fromApiData),
    );

    return new Map(
      await Promise.all(
        this.categoryLevelPairs.map(async pair => [
          pair,
          runs
            .filter(
              r =>
                r.levelId === pair.levelId && r.categoryId === pair.categoryId,
            )
            .concat(
              await Promise.all(
                (
                  nProps(
                    extraRuns,
                    this.gameId,
                    pair.categoryId,
                    pair.levelId,
                  ) || []
                ).map(Run.fromApiData),
              ),
            )
            .sort(
              compareAll(
                (r, s) => compareDefault(r.durationSeconds, s.durationSeconds),
                (r, s) => compareDefault(r.date, s.date),
                (r, s) =>
                  compareDefault(r.dateTimeSubmitted, s.dateTimeSubmitted),
              ),
            ),
        ]),
      ),
    );
  }
}

export class CategoryLevelPair {
  constructor(...args) {
    this.ℹ️ = this.constructor.name;
    this.gameId = this.categoryId = this.categoryNick = this.levelId = this.levelNick = this.nick = this.url = void this;
    Object.seal(this);
    Object.assign(this, ...args);
  }

  get slug() {
    return [this.categoryId, this.levelId].filter(Boolean).join("-");
  }

  get nickSlug() {
    return [this.categoryNick, this.levelNick]
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
  }

  matchesSlug(slug) {
    if (slug === this.slug) {
      return true;
    }
    if (slug === this.categoryId) {
      return true;
    }
    if (slug === this.levelId) {
      return true;
    }
    if (
      this.levelNick &&
      slug === this.levelNick.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    ) {
      return true;
    }
    if (
      this.categoryNick &&
      slug === this.categoryNick.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    ) {
      return true;
    }
    if (this.levelNick && this.categoryNick && slug === this.nickSlug) {
      return true;
    }
    return false;
  }
}

export class Run {
  constructor(...args) {
    this.ℹ️ = this.constructor.name;
    this.runId = this.runner = this.durationSeconds = this.durationText = this.date = this.dateTimeSubmitted = this.levelId = this.categoryId = this.url = void this;
    Object.seal(this);
    Object.assign(this, ...args);
  }

  static normalizeDurationText(durationText) {
    const match = /^([A-Z]{2})(?:([0-9]{1,})H)?(?:([0-9]{1,2})M)?(?:([0-9]{1,2})(?:\.([0-9]{1,3}))?S)?$/i.exec(
      durationText,
    );
    if (!match) {
      throw new Error(`failed to normalize duration: ${durationText}`);
    }
    const [prefix, full, hours, minutes, seconds, miliseconds] = match;
    const pieces = [];
    if (hours != null) {
      pieces.push(
        String(Number(hours)).padStart(2, pieces.length ? "0" : " "),
        "h",
      );
    }
    if (hours != null || minutes != null) {
      pieces.push(
        String(Number(minutes)).padStart(2, pieces.length ? "0" : " "),
        "m",
      );
    }
    pieces.push(
      String(Number(seconds || 0)).padStart(2, pieces.length ? "0" : " "),
    );
    if (hours == null && miliseconds != null) {
      pieces.push(".", String(Number(miliseconds)).padStart(3, "0"));
    }
    pieces.push("s");
    return pieces.join("");
  }

  static async fromApiData(data) {
    let runner;

    if (data.players.data.length === 1) {
      runner = Runner.fromApiData(data.players.data[0]);
    } else {
      runner = new Runner({
        nick: `${data.players.data.length} players`,
        isUser: false,
      });
    }

    return new Run({
      runId: data.id,
      runner,
      durationSeconds: data.times.primary_t,
      durationText: Run.normalizeDurationText(data.times.primary),
      date: data.date,
      dateTimeSubmitted: data.submitted,
      levelId: data.level,
      categoryId: data.category,
      url: data.weblink,
    });
  }
}
