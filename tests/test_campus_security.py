"""Authorization boundary tests against an isolated loopback test server."""
from pathlib import Path
import http.client, json, sys, tempfile, threading, time, unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app import Server
from storage import Store
from access import digest
from config import COOKIE
from demo_content import QUESTIONS, TYPING_TEXT
from practice_texts import TEXTS, READING_QUESTIONS
QUESTIONS.update(READING_QUESTIONS)

class CampusSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory=tempfile.TemporaryDirectory();cls.store=Store(Path(cls.directory.name)/'test.sqlite3')
        cls.codes={'alice':'MJ-'+'A1'*16,'bob':'MJ-'+'B2'*16}
        cls.store.create_code('alice',cls.codes['alice']);cls.store.create_code('bob',cls.codes['bob'])
        cls.server=Server(0,cls.store);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.directory.cleanup()
    def setUp(self):
        with self.store.db() as db:
            for table in ('sessions','failures','attempts','text_rotation'):db.execute('DELETE FROM '+table)
            db.execute('UPDATE users SET active=1');db.execute('UPDATE access_codes SET active=1,expires=NULL')
    def request(self,path,method='GET',body=None,cookie=None,csrf=None,origin=True,host=None,accept=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        headers={'Host':host or self.server.authority}
        if accept:headers['Accept']=accept
        if cookie:headers['Cookie']=cookie
        if csrf:headers['X-CSRF-Token']=csrf
        if method=='POST':
            headers['Content-Type']='application/json'
            if origin:headers['Origin']=self.server.origin if origin is True else origin
        raw=json.dumps(body).encode() if body is not None else None
        conn.request(method,path,body=raw,headers=headers);response=conn.getresponse();data=response.read();status=response.status;received=dict(response.getheaders());conn.close()
        if received.get('Content-Type','').startswith('application/json') and data:data=json.loads(data)
        return status,data,received
    def guest(self):
        status,data,headers=self.request('/api/session');self.assertEqual(status,200)
        return headers['Set-Cookie'].split(';')[0],data['csrf']
    def login(self,user='alice',code=None):
        cookie,csrf=self.guest();status,data,headers=self.request('/api/login','POST',{'code':code or self.codes[user]},cookie,csrf)
        self.assertEqual(status,200);return headers['Set-Cookie'].split(';')[0],data['csrf']
    def start(self,cookie,csrf,mode='module-1'):
        status,data,_=self.request('/api/exams/start','POST',{'mode':mode},cookie,csrf);self.assertEqual(status,200);return data
    def test_public_site_and_headers(self):
        status,_,headers=self.request('/');self.assertEqual(status,200);self.assertEqual(headers['X-Frame-Options'],'DENY');self.assertEqual(headers['Cache-Control'],'no-store');self.assertIn("frame-ancestors 'none'",headers['Content-Security-Policy'])
    def test_private_pages_and_apis_deny_without_session(self):
        for path in ['/campus','/campus/','/campus/app.js','/campus/library.js','/campus/styles.css','/api/dashboard','/api/typing','/api/library','/api/library/modules/1','/api/library/modules/general','/api/library/books/1.pdf']:
            self.assertEqual(self.request(path)[0],401,path)
    def library_fixture(self):
        folder=self.store.path.parent/'library';(folder/'documents').mkdir(parents=True,exist_ok=True)
        data={'note':'Fixture independiente','edition':'Prueba','sources':[{'id':1,'title':'Fuente de prueba','pages':2,'originalName':'prueba.pdf','sha256':'private-metadata'}],'modules':[{'id':i,'title':'Ficha de prueba','intro':'Introducción','sourceIds':[1],'summary':[{'title':'Tema','paragraphs':['Contenido de prueba'],'references':[{'source':1,'from':2,'to':2}]}],'conceptMap':{'root':'Raíz','branches':[]},'comparison':{'columns':['Concepto'],'rows':[['Prueba']]},'outline':[],'notes':[]} for i in ['1','2','3','4','5','general']]}
        (folder/'library.json').write_text(json.dumps(data),encoding='utf-8')
        (folder/'documents/module-1.pdf').write_bytes(b'%PDF-1.4\nPrivate fixture')
    def test_library_catalog_details_and_private_book(self):
        self.library_fixture();cookie,_=self.login()
        status,data,headers=self.request('/api/library',cookie=cookie)
        self.assertEqual(status,200);self.assertEqual(len(data['modules']),6);self.assertNotIn('sha256',data['sources'][0]);self.assertNotIn('summary',data['modules'][0]);self.assertEqual(headers['Cache-Control'],'no-store')
        for identifier in ['1','2','3','4','5','general']:
            status,data,_=self.request('/api/library/modules/'+identifier,cookie=cookie)
            self.assertEqual(status,200);self.assertEqual(data['module']['id'],identifier);self.assertIn('conceptMap',data['module'])
        status,body,headers=self.request('/api/library/books/1.pdf',cookie=cookie)
        self.assertEqual(status,200);self.assertTrue(body.startswith(b'%PDF'));self.assertEqual(headers['Content-Type'],'application/pdf')
    def test_library_rejects_unknown_and_traversal_paths(self):
        self.library_fixture();cookie,_=self.login()
        for path in ['/api/library/modules/6','/api/library/modules/01','/api/library/books/general.pdf','/api/library/books/6.pdf','/api/library/books/../library.json','/library/library.json','/server/library.py']:
            self.assertEqual(self.request(path,cookie=cookie)[0],404,path)
    def test_library_head_and_revocation_enforce_session(self):
        self.library_fixture();cookie,_=self.login()
        self.assertEqual(self.request('/api/library/books/1.pdf','HEAD')[0],401)
        self.assertEqual(self.request('/api/library/books/1.pdf','HEAD',cookie=cookie)[0],200)
        with self.store.db() as db:db.execute('UPDATE access_codes SET active=0 WHERE username=?',('alice',))
        for path in ['/api/library','/api/library/modules/general','/api/library/books/1.pdf']:
            self.assertEqual(self.request(path,cookie=cookie)[0],401,path)
    def test_head_does_not_bypass_authentication(self):self.assertEqual(self.request('/campus','HEAD')[0],401)
    def test_browser_without_session_returns_to_login_but_api_stays_private(self):
        status,_,headers=self.request('/campus',accept='text/html')
        self.assertEqual(status,303);self.assertEqual(headers['Location'],'/ingreso')
        self.assertEqual(self.request('/api/library',accept='text/html')[0],401)
    def test_anonymous_and_forged_cookies_denied(self):
        cookie,_=self.guest()
        for value in [cookie,f'{COOKIE}=forged-token']:
            self.assertEqual(self.request('/api/dashboard',cookie=value)[0],401)
    def test_private_source_and_files_not_served(self):
        for path in ['/backend/app.py','/frontend/campus/index.html','/server/app.py','/server/demo_content.py','/server/campus/index.html','/.env','/.git/config','/README.md','/assets/docs/pdfs-estudio/test.pdf','/css/../../server/app.py','/css/%2e%2e/%2e%2e/server/app.py','/assets/img/..%5c..%5cserver/app.py']:
            self.assertEqual(self.request(path)[0],404,path)
    def test_bad_host_denied(self):self.assertEqual(self.request('/',host='attacker.invalid')[0],403)
    def test_login_and_cookie_flags(self):
        cookie,csrf=self.guest();status,_,headers=self.request('/api/login','POST',{'code':self.codes['alice']},cookie,csrf)
        self.assertEqual(status,200);self.assertIn('HttpOnly',headers['Set-Cookie']);self.assertIn('SameSite=Strict',headers['Set-Cookie'])
    def test_login_rotates_session(self):
        old,csrf=self.guest();status,_,headers=self.request('/api/login','POST',{'code':self.codes['alice']},old,csrf)
        self.assertEqual(status,200);self.assertNotEqual(old,headers['Set-Cookie'].split(';')[0]);self.assertEqual(self.request('/api/dashboard',cookie=old)[0],401)
    def test_wrong_code_and_sql_injection_denied(self):
        cookie,csrf=self.guest()
        for code in ['MJ-'+'FF'*16,"' OR 1=1 --"]:
            self.assertEqual(self.request('/api/login','POST',{'code':code},cookie,csrf)[0],401)
    def test_brute_force_limit(self):
        cookie,csrf=self.guest()
        for _ in range(6):self.assertEqual(self.request('/api/login','POST',{'code':'MJ-'+'FF'*16},cookie,csrf)[0],401)
        self.assertEqual(self.request('/api/login','POST',{'code':self.codes['alice']},cookie,csrf)[0],429)
    def test_cross_origin_and_missing_csrf_denied(self):
        cookie,csrf=self.login()
        self.assertEqual(self.request('/api/exams/start','POST',{'mode':'module-1'},cookie,None)[0],403)
        self.assertEqual(self.request('/api/exams/start','POST',{'mode':'module-1'},cookie,csrf,origin='http://attacker.invalid')[0],403)
        self.assertEqual(self.request('/api/exams/start','POST',{'mode':'module-1'},cookie,csrf,origin=False)[0],403)
    def test_expired_and_revoked_access_denied(self):
        cookie,csrf=self.login()
        with self.store.db() as db:db.execute('UPDATE sessions SET touched=?',(time.time()-1900,))
        self.assertEqual(self.request('/api/dashboard',cookie=cookie)[0],401)
        cookie,csrf=self.login()
        with self.store.db() as db:db.execute('UPDATE users SET active=0 WHERE username=?',('alice',))
        self.assertEqual(self.request('/campus',cookie=cookie)[0],401)
    def test_logout_invalidates_cookie_on_server(self):
        cookie,csrf=self.login();self.assertEqual(self.request('/api/logout','POST',{},cookie,csrf)[0],200);self.assertEqual(self.request('/api/dashboard',cookie=cookie)[0],401)
    def test_question_counts_and_no_answer_key(self):
        cookie,csrf=self.login()
        for mode,count in [('module-1',4),('module-5',4),('final',20),('reading',4)]:
            data=self.start(cookie,csrf,mode);self.assertEqual(len(data['questions']),count)
            self.assertTrue(all('correct' not in q and 'explanation' not in q for q in data['questions']))
    def test_server_marks_and_does_not_accept_client_score(self):
        cookie,csrf=self.login();data=self.start(cookie,csrf);answers={q['id']:QUESTIONS[q['id']]['correct'] for q in data['questions']}
        status,result,_=self.request('/api/exams/submit','POST',{'attempt':data['attempt'],'answers':answers,'score':0,'username':'bob'},cookie,csrf)
        self.assertEqual(status,200);self.assertEqual(result['score'],4);self.assertTrue(result['passed'])
        status,dashboard,_=self.request('/api/dashboard',cookie=cookie);self.assertIn('module-1',dashboard['achievements'])
        self.assertEqual(self.request('/api/exams/submit','POST',{'attempt':data['attempt'],'answers':answers},cookie,csrf)[0],409)
    def test_other_user_cannot_submit_attempt(self):
        cookie,csrf=self.login();data=self.start(cookie,csrf);other,other_csrf=self.login('bob')
        self.assertEqual(self.request('/api/exams/submit','POST',{'attempt':data['attempt'],'answers':{}},other,other_csrf)[0],404)
    def test_partial_and_invalid_answers_denied(self):
        cookie,csrf=self.login();data=self.start(cookie,csrf)
        self.assertEqual(self.request('/api/exams/submit','POST',{'attempt':data['attempt'],'answers':{}},cookie,csrf)[0],400)
        self.assertEqual(self.request('/api/exams/start','POST',{'mode':[]},cookie,csrf)[0],400)
    def test_typing_uses_server_time_and_does_not_store_transcription(self):
        cookie,csrf=self.login();status,data,_=self.request('/api/typing/start','POST',{},cookie,csrf);self.assertEqual(status,200)
        status,result,_=self.request('/api/typing/submit','POST',{'attempt':data['attempt'],'text':data['text'],'seconds':9999},cookie,csrf)
        self.assertEqual(status,200);self.assertEqual(result['accuracy'],100);self.assertLess(result['seconds'],9999)
        with self.store.db() as db:row=db.execute('SELECT result FROM attempts WHERE id=?',(data['attempt'],)).fetchone()
        self.assertNotIn(data['text'],row['result'])
    def test_text_rotation_has_no_repeats_and_survives_new_session(self):
        cookie,csrf=self.login()
        for mode in ('reading','typing'):
            seen=[]
            for i in range(len(TEXTS)*2):
                if i==2:cookie,csrf=self.login()
                data=self.start(cookie,csrf,'reading') if mode=='reading' else self.request('/api/typing/start','POST',{},cookie,csrf)[1]
                if seen:self.assertNotEqual(seen[-1],data['textId'])
                seen.append(data['textId'])
                text=data['passage'] if mode=='reading' else data['text']
                self.assertGreaterEqual(len(text.split()),350)
                self.assertEqual(data['wordCount'],len(text.split()))
            self.assertEqual(len(set(seen[:len(TEXTS)])),len(TEXTS))
            self.assertEqual(len(set(seen[len(TEXTS):])),len(TEXTS))
    def test_reading_questions_match_selected_text_and_are_corrected(self):
        cookie,csrf=self.login()
        for _ in TEXTS:
            data=self.start(cookie,csrf,'reading');source=next(t for t in TEXTS if t['id']==data['textId'])
            self.assertEqual(data['passage'],source['text']);self.assertEqual({q['id'] for q in data['questions']},set(source['questionIds']))
            answers={q['id']:QUESTIONS[q['id']]['correct'] for q in data['questions']}
            status,result,_=self.request('/api/exams/submit','POST',{'attempt':data['attempt'],'answers':answers},cookie,csrf)
            self.assertEqual(status,200);self.assertEqual(result['percent'],100)
    def test_typing_correction_uses_assigned_text_and_rejects_replaced_attempt(self):
        cookie,csrf=self.login();_,old,_=self.request('/api/typing/start','POST',{},cookie,csrf)
        _,current,_=self.request('/api/typing/start','POST',{},cookie,csrf)
        self.assertEqual(self.request('/api/typing/submit','POST',{'attempt':old['attempt'],'text':old['text']},cookie,csrf)[0],404)
        status,result,_=self.request('/api/typing/submit','POST',{'attempt':current['attempt'],'text':old['text'],'source':old['text']},cookie,csrf)
        self.assertEqual(status,200);self.assertLess(result['accuracy'],100);self.assertFalse(result['completed'])
    def test_history_is_scoped_to_user(self):
        alice,csrf=self.login();data=self.start(alice,csrf);answers={q['id']:0 for q in data['questions']}
        self.request('/api/exams/submit','POST',{'attempt':data['attempt'],'answers':answers},alice,csrf)
        bob,_=self.login('bob');self.assertEqual(self.request('/api/dashboard',cookie=bob)[1]['results'],[])
    def test_achievements_survive_more_than_one_hundred_recent_practices(self):
        with self.store.db() as db:
            db.execute('INSERT INTO attempts(id,username,mode,questions,started,submitted,score,total) VALUES(?,?,?,?,?,?,?,?)',('earned','alice','module-1','[]',1,2,3,4))
            db.executemany('INSERT INTO attempts(id,username,mode,questions,started,submitted,score,total) VALUES(?,?,?,?,?,?,?,?)',[(f'recent-{i}','alice','typing','[]',10+i,11+i,1,10) for i in range(105)])
        cookie,_=self.login()
        dashboard=self.request('/api/dashboard',cookie=cookie)[1]
        self.assertIn('module-1',dashboard['achievements'])
        self.assertEqual(len(dashboard['results']),20)
    def test_non_ascii_csrf_is_rejected_without_crashing(self):
        cookie,_=self.login()
        self.assertEqual(self.request('/api/exams/start','POST',{'mode':'module-1'},cookie,'ñ')[0],403)
    def test_legacy_password_login_is_removed(self):
        cookie,csrf=self.guest()
        self.assertEqual(self.request('/api/login','POST',{'username':'alice','password':'test-only-alice'},cookie,csrf)[0],400)
    def test_revoked_code_invalidates_live_session(self):
        cookie,csrf=self.login()
        with self.store.db() as db:db.execute('UPDATE access_codes SET active=0 WHERE username=?',('alice',))
        self.assertEqual(self.request('/api/dashboard',cookie=cookie)[0],401)
        guest,token=self.guest()
        self.assertEqual(self.request('/api/login','POST',{'code':self.codes['alice']},guest,token)[0],401)
    def test_expired_code_cannot_login(self):
        with self.store.db() as db:db.execute('UPDATE access_codes SET expires=? WHERE username=?',(time.time()-1,'alice'))
        cookie,csrf=self.guest()
        self.assertEqual(self.request('/api/login','POST',{'code':self.codes['alice']},cookie,csrf)[0],401)
    def test_code_is_not_an_authentication_query_parameter(self):
        self.assertEqual(self.request('/api/dashboard?code='+self.codes['alice'])[0],401)
    def test_only_code_fingerprint_is_stored(self):
        with self.store.db() as db:row=db.execute('SELECT fingerprint FROM access_codes WHERE username=?',('alice',)).fetchone()
        self.assertEqual(row['fingerprint'],digest('MJ'+'A1'*16))
        self.assertNotEqual(row['fingerprint'],self.codes['alice'])
if __name__=='__main__':unittest.main(verbosity=2)
