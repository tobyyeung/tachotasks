(function () {
  const config = window.TACHO_DOWNLOADS;
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const key = /mac/i.test(platform) ? 'mac' : /linux/i.test(platform) ? 'linux' : 'windows';
  const labels = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  const urls = Object.fromEntries(Object.entries(config.files).map(([name, file]) => [name, `${config.baseUrl}${encodeURIComponent(file)}`]));
  const downloadButton = document.getElementById('download-button');
  const title = document.getElementById('download-title');
  const subtitle = document.getElementById('download-subtitle');
  const hero = document.getElementById('hero-download');

  downloadButton.href = urls[key];
  downloadButton.setAttribute('download', '');
  title.textContent = `Download for ${labels[key]}`;
  subtitle.textContent = key === 'windows' ? 'Windows installer (.exe)' : `Latest release · ${labels[key]}`;
  hero.href = urls[key];
  hero.setAttribute('download', '');
  document.getElementById('platform-note').textContent = `Free for ${labels[key]} · Also available on the web · Your data stays in sync.`;
  Object.entries(urls).forEach(([name, url]) => {
    const link = document.getElementById(`${name}-download`);
    link.href = url;
    link.setAttribute('download', '');
  });
})();
