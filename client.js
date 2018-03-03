import HTML from '/lib/html.js';
import {zip, devAwaitDeep} from '/lib/iteration.js';

import {defaultPath} from '/config/client.js';


const getBestsModel = (gameSlugs, playerSlug) => {
  const TYPE = '';
  
  const NOT_IMPLEMENTED = undefined;
  
  const hostname = document.location.host;
  const glitchProjectName =
        hostname.match(/^[a-z0-9\-]+\.glitch\.me$/) ? hostname.split('.')[0] : null;

  const getPlayer = async (slug) => {
    const player = await api(`users/${playerSlug}`);
    return {
      [TYPE]: 'Player',

      id: player.id,
      nick: player.names.international,
      url: player.weblink,
    };
  };
  
  const player = getPlayer(playerSlug);

  const games = gameSlugs.map(async (gameSlug) => {
    const game = await api(`games/${gameSlug}?embed=levels,categories,players`);

    const playerRuns = player.then(p => api(`runs?user=${p.id}&game=${game.id}`));

    return {
      [TYPE]: 'Game',

      id: game.id,
      url: game.weblink,
      nick: game.names.international,

      iconUrl: Promise.reject(new Error("not implemented")) || NOT_IMPLEMENTED,
      trophyUrls: NOT_IMPLEMENTED,

      gameRecords: new Promise(x => x),
      levelRecords: NOT_IMPLEMENTED,
    };
  });
  
  const blehGames = async (games) {
    
  }
  
  return {
    [TYPE]: 'BestsView',

    glitchProjectName,
    player,
    games,
  };
};


const getBestsView = async function*(model) {
  const playerLink = playerReq.then(player => HTML`<a href="${player.weblink}">${player.names.international}</a>`);

  for (const [gameReq, gameRunsReq] of zip(gameReqs, gameRunsReqs)) {
    const icon = gameReq.then(game => HTML`<img src="${game.assets.icon.uri}" alt="">`);
    const placement = async (n) => {
      const suffix =
          (n % 10 == 1 && n % 100 != 11) ? 'st' :
          (n % 10 == 2 && n % 100 != 12) ? 'nd' :
          (n % 10 == 3 && n % 100 != 13) ? 'rd' :
          'th';

      const nth = `${n}${suffix}`;

      let asset = (await gameReq).assets[`trophy-${nth}`];

      if (asset) {
        return HTML`<img class="placement" src="${asset.uri}" alt="${nth}">`;
      } else {
        return HTML`<span class="placement">${n}<sup>${suffix}</sup></span>`;
      }
    };

    yield HTML`
      <section>${gameReq.then(game => HTML`
        <h2>${icon} ${game.names.international} ${icon}</h2>

        <h3>${icon} <a href="${game.weblink}/full_game">Full Game</a> ${icon}</h3>

        <table class="game-records">
          <thead>
            <tr>
              <th>Category</th>
              <th>World Record</th>
              <th>${playerLink}'s Best</th>
            </tr>
          </thead>
          <tbody>
            ${gameReq.then(game => game.categories.data.map(c => {
              if (c.type === 'per-game') return HTML`
                <tr class="">
                  <th><a href="${c.weblink}">${c.name}</a></th>
                  <td><span class="none">none</span></td>
                  <td><span class="none">none</span></td>
                </tr>
              `
            }))}
          </tbody>
        </table>

        <h3>${icon} <a href="${game.weblink}/individual_levels">Individual Levels</a> ${icon}</h3>

        <table class="level-records">
          <thead>
            <tr>
              <th>Level</th>
              <th>World Record</th>
              <th>${playerLink}'s Best</th>
            </tr>
          </thead>
          <tbody>
            ${game.levels.data.map(async level => {
              const records = (await api(`levels/${level.id}/records?max=200`))[0].runs;

              return HTML`
                <tr class="">
                  <th><a href="${level.weblink}">${level.name}</a></th>
                  <td>${
                    records
                      .filter(r => r.place == 1)
                      .map(r => r.run)
                      .map(run => HTML`
                        <div>
                          <a href="${run.weblink}">
                            <span class="time">${run.times.primary.toLowerCase().slice(2).replace(/\D+/g, s => `${s} `).trim()}</span>
                            ${placement(1)}
                            ${run.players.map(p => p.name || p.id)}
                          </a>
                        </div>
                      `) || HTML`<span class="none">none</span>`
                  }</td>
                  <td>${playerReq.then(player => records
                      .filter(r => r.run.players.some(p => p.id === player.id))
                      .slice(0, 1)
                      .map(record => HTML`
                        <div>
                          <a href="${record.run.weblink}">
                            <span class="time">${record.run.times.primary.toLowerCase().slice(2).replace(/\D+/g, s => `${s} `).trim()}</span>
                            ${placement(record.place)}
                          </a>
                        </div>
                      `) || HTML`<span class="none">none</span>`
                  )}</td>
                </tr>
              `
            })}
          </tbody>
        </table>
      `)}</section>
    `;
  }
};


let api; {
  const apiRoot = '/https://www.speedrun.com/api/v1/';
  const apiFetch = async path => {
    const url = apiRoot + path;
    const response = await fetch(url);
    const body = await response.json();
    if (body.status) {
      throw new Error(`${body.status}: ${body.message}`); 
    } else {
      return body.data;
    }
  };
  const apiCache = new Map();
  api = async path => {
    if (!apiCache.has(path)) {
      const result = await apiFetch(path);
      apiCache.set(path, result);
      return result;
    } else {
      return apiCache.get(path);
    }
  };
};


({set _(_){_._=(async _=>(await _)(_._))(_)}})._ = async main => {
  (async () => {
    const loadingMessage = document.querySelector('#loading-message');
    try {
      await main;
      loadingMessage.remove();
    } catch (error) {
      loadingMessage.textContent = `${error}\n\n${error.stack}`;
      throw error;
    }
  })();

  const hostname = document.location.host;
  const d = hostname.match(/^[a-z0-9\-]+\.glitch\.me$/) ? hostname.split('.')[0] : null;

  // force HTTPS if running on Glitch, where we know it's available.
  if (d && document.location.protocol === 'http:') {
    document.location.protocol = 'https:';
  }

  let pathString = document.location.pathname;
  let jsonRedirect = false;
  if (pathString.endsWith('.json')) {
    jsonRedirect = true;
    pathString = pathString.slice(0, -'.json'.length);
  }
  const path = pathString.slice(1).split(/\//g).filter(Boolean);

  const defaultName = "bests";
  const title = `${d || defaultName}.glitch.me`;

  document.title = (path.length) ? `${defaultName}…/${path.join('/')}` : title;

  const output = await HTML.element`<div></div>`; 
  document.querySelector('#main').appendChild(output);

  output.appendChild(HTML.fragment`
    <header>
      <h1><span>
        <img src="${document.querySelector('link[rel=icon]').href}">
        <a href="/">${title}</a>
      <span></h1>

      ${d && HTML`
        <nav class="links"><a href="${`https://glitch.com/edit/#!/${d}?path=client.js`}">view/edit source</a></nav>
      `}
    </header>
  `);

  const blockers = [];

  if (path.length === 0) {
    document.location.replace(`/${defaultPath}`);
  } else if (path.length === 1) {
    const [gamesSlug, playerSlug] = path[0].split('@');
    if (!gamesSlug) throw new Error("no game(s) in URL");
    if (!playerSlug) throw new Error("no player in URL");

    const gameSlugs = gamesSlug.split(/\+/g).filter(Boolean);
    if (gameSlugs.length == 0) throw new Error("no game(s) in URL");

    const model = getBestsModel(gameSlugs, playerSlug);
    if (jsonRedirect) {
      output.appendChild(HTML.fragment`
        <p class="in-your-face-dev-message">
          Redirecting to JSON view model data in a moment...
        </p>
      `);
      
      // we let the standard render continue below while we wait for the redirect.
      (async () => {
        const syncModel = await devAwaitDeep(model);
        document.location.assign(URL.createObjectURL(new Blob([JSON.stringify(syncModel, null, 2)], {type: 'application/json'})));
      })();
    }      
    const view = getBestsView(model);

    const [fragment, done] = HTML.from(view).fragmentAndDone();
    output.appendChild(fragment);
    blockers.push(done);
  } else {
    throw new Error("404/invalid URL");
  }

  output.appendChild(HTML.fragment`
    <footer>
      This site displays data from <a href="https://www.speedrun.com/about">speedrun.com</a>,
      used under <a href="https://creativecommons.org/licenses/by-nc/4.0/">the CC BY-NC license</a> and
      loaded from <a href="https://github.com/speedruncomorg/api/blob/master/version1/README.md#readme">their API</a>.
    </footer>
  `);
  
  await Promise.all(blockers);
};
