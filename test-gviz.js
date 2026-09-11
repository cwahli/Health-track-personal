const url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/gviz/tq?tqx=out:csv&sheet=meal%20log";
fetch(url).then(r => r.text()).then(console.log).catch(console.error);
