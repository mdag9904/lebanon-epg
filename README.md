# Lebanon EPG (XMLTV) – MTV + LBCI

Generates a single `docs/epg.xml` file in **Asia/Beirut** time.

## Sources

### MTV Lebanon (JSON)
- Days list: https://www.mtv.com.lb/en/api/schedule/daysand
- Day schedule: https://www.mtv.com.lb/en/api/schedule/days/{DAY_ID}

### LBCI (HTML)
- Daily schedule: https://www.lbcgroup.tv/schedule-channels-date/1/YYYY/MM/DD/en

## Output
GitHub Pages serves:
- https://<your-username>.github.io/<repo-name>/epg.xml

## Run locally
```bash
npm i
npm run build:epg
