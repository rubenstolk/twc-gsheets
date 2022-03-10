const fs = require('fs').promises;
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const CONFIG = require(`${__dirname}/config.json`);

(async () => {
  const doc = new GoogleSpreadsheet(CONFIG.GSHEETS_SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: CONFIG.GSHEETS_CLIENT_EMAIL,
    private_key: CONFIG.GSHEETS_PRIVATE_KEY
  });

  await doc.loadInfo();
  console.info(`Loaded GSheet ${doc.title}`);

  for (const [name, twc] of Object.entries(CONFIG.TWC)) {
    try {
      const lifetime = (await axios.get(`http://${twc.IP}/api/1/lifetime`, { timeout: 1000 })).data;
      const vitals = (await axios.get(`http://${twc.IP}/api/1/vitals`, { timeout: 1000 })).data;

      if (!lifetime || !vitals) {
        throw new Error('Fetching data failed');
      }

      const data = { ...lifetime, ...vitals };

      await fs.mkdir(`${__dirname}/twc/${name}`, { recursive: true });
      await fs.writeFile(`${__dirname}/twc/${name}/${lifetime.charge_starts}.json`, JSON.stringify(data, null, 2));

      console.info(`\n[${name}]: Wrote data to twc/${name}/${lifetime.charge_starts}.json`);

      const sheet = doc.sheetsById[twc.SHEET_ID];
      console.info(`\n[${name}]: Loaded sheet: ${sheet.title}`);

      const rows = await sheet.getRows();
      const rowData = { Session: data.charge_starts, 'Session Wh': data.session_energy_wh, 'Total Wh': data.energy_wh };
      const row = rows.find(row => String(row.Session) === String(rowData.Session));

      if (row) {
        row['Session Wh'] = rowData['Session Wh'];
        row['Total Wh'] = rowData['Total Wh'];
        await row.save();
        console.info(`\n[${name}]: Updated session ${JSON.stringify(rowData)}`);
      }
      else {
        await sheet.addRow(rowData);
        console.info(`\n[${name}]: Added session ${JSON.stringify(rowData)}`);
      }
    }
    catch (ex) {
      console.error(`[${name}]: Failed to update`, ex.message);
    }
  }
})();
