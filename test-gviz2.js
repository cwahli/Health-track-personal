const url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/gviz/tq?tqx=out:csv&sheet=meal%20log";
fetch(url).then(r => r.text()).then(txt => console.log(txt.split('\n').slice(0, 3).join('\n'))).catch(console.error);
