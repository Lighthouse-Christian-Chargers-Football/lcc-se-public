# lcc-se-public

Public static assets for the Lighthouse Christian Chargers football pages on
SportsEngine (`lcachargers.com`), served through GitHub Pages so they load
with CORS headers SportsEngine's own CDN doesn't send (see
[`lcc_sportsengine`](https://github.com/Lighthouse-Christian-Chargers-Football/lcc_sportsengine)'s
README for why that matters).

```
css/    Stylesheets pasted (via <link>) into SportsEngine's page "Custom HEAD" fields
data/   schedules.json + {team}_roster.json - published automatically by
        lcc_sportsengine's GitHub Actions workflow, not hand-edited here
img/    Schedule background graphics (v_bg.jpeg / jv_bg.jpeg / jh_bg.jpeg)
```

This repo is the "deploy target" for the automated schedule/roster
pipeline and for manual image updates - the actual page HTML/JS lives in
`lcc_sportsengine`, which is where day-to-day content changes happen.
