// Local API (LyricMapAPI on uvicorn), used by `ng serve --configuration local`.
// localhost rather than 127.0.0.1, so the admin login cookie counts as same-site with the dev server.
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000',
  cartoApiKey: 'cb1_403y_1_32e0222b3bfe12aa6ebf93c1'
};
