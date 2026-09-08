// Run with Electron against the built app. Uses isolated test data, never user data.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'release', 'ui-smoke-data'));
app.commandLine.appendSwitch('disable-gpu');
let server;
app.whenReady().then(async () => {
  server = http.createServer((req,res) => {
    const file = path.resolve(root, 'dist', '.' + req.url.split('?')[0]);
    const target = req.url === '/' ? path.join(root, 'dist/index.html') : file;
    if (!target.startsWith(path.join(root,'dist') + path.sep) || !fs.existsSync(target)) { res.writeHead(404); res.end(); return; }
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png' };
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(origin) && !details.url.startsWith('data:') }));
  const win = new BrowserWindow({ show:false, width:1280, height:900, webPreferences:{ offscreen:true, contextIsolation:true } });
  await win.loadURL(origin);
  const result = await win.webContents.executeJavaScript(`(async () => {
    const storage = await import('/js/api/task-state.js');
    init = () => {}; // Exercise views and storage in isolation from auth bootstrap.
    window.restoreKnownTaskSectionMetadata = null;
    window.api = { saveTaskCollections: storage.writeTaskCollections, getTaskCollections: storage.readTaskCollections,
      getProjects: async () => state.projects, getProfiles: async () => state.profiles,
      getSettings: async () => state.settings, getUser: async () => null };
    state.settings = { devMode:true, taskSections:[{id:'review',name:'Review'}] }; state.currentView='archive';
    state.profiles = [{id:'profile-personal',name:'Personal',image:'assets/profiles/personal.png'}];
    state.projects = [{id:'test-project',name:'Desktop update',color:'#48dbfb',sections:[{id:'review',name:'Review'}]}];
    state.tasks = [];
    const now = new Date().toISOString();
    state.archivedTasks = [
      {id:'smoke-1',title:'Verify update progress',description:'Confirm the progress indicator and restart button are available.',completed:true,completedAt:now,updatedAt:now,projectId:'test-project',sectionId:'review',dueDate:'2026-09-08',dueTime:'15:00',priority:'P1',tags:['release']},
      {id:'smoke-2',title:'Check archive restore',completed:true,completedAt:now,updatedAt:now,profileId:'profile-personal',priority:'P3'},
      {id:'smoke-3',title:'Test search and filters',description:'Search should preserve input focus.',completed:true,completedAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z',profileId:'profile-personal',sectionId:'review',dueDate:'2026-09-01',priority:'P4'}
    ];
    await storage.writeTaskCollections({ tasks:state.tasks, archivedTasks:state.archivedTasks });
    paintAppVersion(window.TACHO_VERSION); renderView();
    const search=document.getElementById('archive-search'); search.value='progress'; search.dispatchEvent(new Event('input',{bubbles:true}));
    const filtered=document.querySelectorAll('.archive-task').length;
    search.value=''; search.dispatchEvent(new Event('input',{bubbles:true}));
    await refreshDataFromStore({reloadCalendars:false});
    const details=document.querySelector('.archive-task-details'); details.open=true;
    search.focus(); search.value=''; search.setSelectionRange(0,0);
    const row=document.querySelector('[data-archive-id="smoke-1"]');
    let mutationCount=0; const observer=new MutationObserver(records => {mutationCount+=records.length;}); observer.observe(document.querySelector('.archive-view'),{subtree:true,childList:true,attributes:true,characterData:true});
    for(let index=0;index<30;index++) await refreshDataFromStore({reloadCalendars:false});
    const stable= row===document.querySelector('[data-archive-id="smoke-1"]') && details.open && document.activeElement===search;
    mutationCount+=observer.takeRecords().length; observer.disconnect();
    const oldDueVisible=row.textContent.includes('3:00 PM') && row.textContent.includes('Original due');
    document.querySelector('[data-archive-restore="smoke-2"]').click();
    await new Promise(resolve => setTimeout(resolve,100));
    const saved=await storage.readTaskCollections();
    return { filtered, stable, mutationCount, oldDueVisible, active:saved.tasks.length, archived:saved.archivedTasks.length, badge:document.getElementById('app-version-badge').textContent, overflow:document.documentElement.scrollWidth>window.innerWidth };
  })()`);
  assert.equal(result.filtered,1); assert.equal(result.active,1); assert.equal(result.archived,2); assert.equal(result.badge,'v1.20.0'); assert.equal(result.overflow,false);
  assert.equal(result.stable,true); assert.equal(result.mutationCount,0); assert.equal(result.oldDueVisible,true);
  fs.writeFileSync(path.join(root,'release/archive-refined.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`window.electronAPI={isElectron:true}; desktopUpdateState={revision:1,status:'downloaded',currentVersion:'1.20.0',version:'1.21.0',percent:100}; state.currentView='settings'; renderView(); paintDesktopUpdateState();`);
  const controls=await win.webContents.executeJavaScript(`({restart:document.querySelector('[data-desktop-update-action="install"]').textContent, version:document.getElementById('desktop-app-version').textContent})`);
  assert.equal(controls.restart,'Restart to update'); assert.equal(controls.version,'v1.20.0');
  const deadlines=await win.webContents.executeJavaScript(`(() => {
    const RealDate=Date;
    const fixed=new RealDate(2026,8,8,16,30).getTime();
    window.Date=class extends RealDate { constructor(...args) { super(...(args.length?args:[fixed])); } static now() { return fixed; } };
    try {
      state.tasks=[{id:'past',title:'Due at 3 PM',projectId:'test-project',dueDate:'2026-09-08',dueTime:'15:00',priority:'P2'},{id:'future',title:'Due at 5 PM',projectId:'test-project',dueDate:'2026-09-08',dueTime:'17:00',priority:'P3'}];
      state.filterProject='test-project'; state.settings.dashboardUpcomingRange='today';
      const dashboard=renderDashboard(); const project=renderProject();
      return { dashboard:dashboard.includes('Overdue') && dashboard.includes('Postpone (1)'), project:project.includes('Overdue (1)') && project.includes('Today (1)') };
    } finally { window.Date=RealDate; }
  })()`);
  assert.equal(deadlines.dashboard,true); assert.equal(deadlines.project,true);
  console.log(JSON.stringify({ archive:result, updater:controls, deadlines }));
  win.destroy(); server.close(); app.quit();
}).catch(error => { console.error(error); server?.close(); app.exit(1); });
