// dev.js
require('dotenv').config();
const app = require('./api/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Express app running locally at http://localhost:${PORT}`);
});