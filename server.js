"use strict";

const { createApplication } = require("./src/app");

if (require.main === module) {
  const { app } = createApplication();
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3000);
  app.listen(port, host, () => {
    console.log(`Sorteio de grupos disponível em http://${host}:${port}`);
  });
}

module.exports = { createApplication };
