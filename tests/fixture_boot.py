"""Bounded evidence for fixture startup failures; no retry or relaxed assertions."""
import json
import time


class FixtureBootEvidence:
    def __init__(self, page, output, label):
        self.page, self.output, self.label = page, output, label
        self.started = time.monotonic()
        self.errors, self.console, self.failed, self.resources = [], [], [], []
        page.on('pageerror', lambda error: self._keep(self.errors, str(error)))
        page.on('console', lambda message: self._keep(self.console, {'type': message.type, 'text': message.text[:1200]}) if message.type in {'error', 'warning'} else None)
        page.on('requestfailed', lambda request: self._keep(self.failed, {'url': self._url(request.url), 'error': request.failure}))
        page.on('response', self._response)
        page.on('crash', lambda _: self._keep(self.errors, 'Browser page crashed'))

    @staticmethod
    def _url(value):
        return '[inline fixture image]' if value.startswith('data:') else value[:500]

    @staticmethod
    def _keep(values, value):
        values.append(value)
        del values[:-80]

    def _response(self, response):
        url = response.url.split('?')[0]
        if url.endswith(('.js', '.css', '.html')) or response.status >= 400:
            self._keep(self.resources, {'url': self._url(response.url), 'status': response.status, 'contentType': response.headers.get('content-type')})

    def _capture(self, stage, error):
        record = {'case': self.label, 'stage': stage, 'elapsedSeconds': round(time.monotonic()-self.started, 3), 'error': str(error), 'pageErrors': self.errors, 'console': self.console, 'failedRequests': self.failed, 'resources': self.resources}
        try:
            record['document'] = self.page.evaluate('''()=>({url:location.href,readyState:document.readyState,userAgent:navigator.userAgent,
              bodyText:document.body?.innerText.slice(-2000),posterCount:document.querySelectorAll('.poster-card').length,
              globals:{api:typeof MovieBoxAPI,app:typeof MovieBoxTV,themes:typeof MovieBoxThemes,artwork:typeof MovieBoxArtwork},
              scripts:Array.from(document.scripts,s=>s.src),pages:Array.from(document.querySelectorAll('main>section'),e=>({id:e.id,hidden:e.hidden}))})''')
        except Exception as failure:
            record['documentError'] = str(failure)
        self.output.mkdir(parents=True, exist_ok=True)
        (self.output/(self.label+'-boot-failure.json')).write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding='utf-8')
        try:
            self.page.screenshot(path=str(self.output/(self.label+'-boot-failure.png')))
        except Exception:
            pass
        print('FIXTURE_BOOT_FAILURE '+json.dumps(record, ensure_ascii=True), flush=True)

    def goto(self, url):
        try:
            return self.page.goto(url)
        except Exception as error:
            self._capture('navigation', error)
            raise

    def wait_for_catalogue(self):
        try:
            # Exact original visibility assertion and Playwright default timeout.
            self.page.locator('.poster-card').first.wait_for()
        except Exception as error:
            self._capture('first-visible-poster', error)
            raise
