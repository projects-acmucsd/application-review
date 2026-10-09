// Playwright regression: open the local Vite app with VITE_API_BASE_URL=http://127.0.0.1:4183.
// Run this function with the page; API responses and collaboration are isolated fixtures.
async (page) => {
  const checks = [];
  const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const base = new URL(page.url()).origin;
  if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Run only against the local development app');
  let decision = 'accept';
  let failReviews = false;
  const review = () => ({applicationId:'sheet-row:1',comment:'Fixture review',rating:8,decision,updatedByEmail:'test-reviewer@acmucsd.org',updatedByName:'Test Reviewer',updatedAt:'2026-10-08T20:00:00.000Z'});
  await page.context().unroute('http://127.0.0.1:4183/**');
  await page.context().route('http://127.0.0.1:4183/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data = [];
    let status = 200;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, PUT, OPTIONS'}});
      return;
    }
    if (path === '/api/reviews') { data = [review()]; if (failReviews) status = 503; }
    else if (path.startsWith('/api/reviews/') && request.method() === 'PUT') { decision = request.postDataJSON().decision; data = review(); }
    else if (path === '/api/settings/application-source') data = {spreadsheetId:'local-verification',spreadsheetUrl:'https://docs.google.com/spreadsheets/d/local-verification/edit',sheetName:'Applications',sheetRange:'A:BM',updatedByEmail:'test-reviewer@acmucsd.org',updatedAt:'2026-10-08T20:00:00.000Z'};
    else if (path === '/api/admin/me') data = {isAdmin:false};
    else if (path === '/api/assignments/me') data = [{applicationId:'sheet-row:1',assigneeEmail:'test-reviewer@acmucsd.org',assigneeName:'Test Reviewer'}];
    await route.fulfill({status,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(status === 200 ? {data} : {error:'Fixture reviews unavailable'})});
  });
  if (typeof page.routeWebSocket === 'function') await page.routeWebSocket('**/ws/collaboration', () => {});
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem('google_session', JSON.stringify({accessToken:'development-access-token',expiresAt:9999999999999,profile:{email:'test-reviewer@acmucsd.org',name:'Test Reviewer',picture:''}})));
  await page.setViewportSize({width:1440,height:1024});
  const applicant = name => page.getByRole('heading',{name,exact:true}).waitFor();

  await page.clock.install();
  const poll = async () => {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/reviews');
    await page.clock.fastForward(20001);
    await response;
    await page.clock.runFor(50);
  };
  const draft='Draft survives automatic refresh';
  const begin = async () => {
    decision=null;
    failReviews=false;
    await page.goto(base + '/review?decision=none');
    await applicant('Test Applicant');
    await page.locator('textarea').fill(draft);
    await page.getByRole('button',{name:'9',exact:true}).click();
    await page.locator('#review-panel').getByRole('button',{name:'Waitlist',exact:true}).click();
  };
  const preserved = async label => {
    await applicant('Test Applicant');
    check(await page.locator('textarea').inputValue()===draft,label+' preserves comment');
    check(await page.getByRole('button',{name:'9',exact:true}).getAttribute('aria-pressed')==='true',label+' preserves rating');
    check(await page.locator('#review-panel').getByRole('button',{name:'Waitlist',exact:true}).getAttribute('aria-pressed')==='true',label+' preserves decision');
    check(await page.getByRole('link',{name:'All2',exact:true}).count()===1,label+' retains displayed queue count');
  };
  await begin();
  failReviews=true;
  await poll();
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await preserved('Failed polling');
  check(await page.getByRole('button',{name:'Save',exact:true}).isDisabled(),'Failed polling disables Save');
  failReviews=false;
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).waitFor();
  await preserved('Retry');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await applicant('Second Test Applicant');
  check(decision==='waitlist','Save persists the preserved decision and releases queue');
  await begin();
  decision='accept';
  await poll();
  await preserved('Remote decision');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await applicant('Second Test Applicant');
  check(await page.getByRole('link',{name:'All1',exact:true}).count()===1,'Cancel releases queue to latest decisions');
  await begin();
  decision='accept';
  await poll();
  await preserved('Remote decision before navigation');
  await page.getByRole('link',{name:/Next/}).click();
  await applicant('Second Test Applicant');
  check(await page.getByRole('button',{name:'Save',exact:true}).count()===0,'Explicit navigation releases draft and queue');
  return {passed:checks.length,checks};
}
