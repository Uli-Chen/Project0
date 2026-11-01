#!/usr/bin/env python3
"""Offline, standard-library validation. Reads source files, writes only local report."""
import json,hashlib,re,unicodedata,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from collections import Counter
from itertools import combinations
BASE=Path(__file__).resolve().parent
TOPICS={'education','technology','environment','society','work','health','culture'}
TYPES={'agree_disagree','discuss_both','adv_disadv','problem_solution','two_part'}
def read(name): return json.loads((BASE/name).read_text())
def normalize(s):
 s=unicodedata.normalize('NFKC',s).casefold().replace('’',"'")
 return ' '.join(re.findall(r'[a-z0-9]+',s))
def paragraphs(path):
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 r=ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
 return [''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in r.findall('.//w:p',ns)]
def canonical(q): return json.dumps(q,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()
def stem(s):
 # Remove common response instructions before lexical duplicate screening.
 s=re.split(r'\b(?:to what extent|do you (?:think|agree)|discuss both|what are the reasons|what are the causes|why is this|why are these|do the advantages)\b',s,flags=re.I)[0]
 stop=set('a an the of to in and or is are it this that some people think believe have has for as on than their they more be do all with can who while others'.split())
 return {w for w in normalize(s).split() if w not in stop}
bank=read('question_bank.mock.json');qs=bank['questions'];manifest=read('record_manifest.json')['records']; ev={x['questionId']:x for x in read('provenance_evidence.json')}
assert bank['bankVersion']=='mock-20261101-v1' and bank['status']=='mock_not_production'
assert len(qs)==38
for field in ['id','bankOrder','exposureKey']:
 assert len({q[field] for q in qs})==38,field
assert {q['bankOrder'] for q in qs}==set(range(1,39))
assert len({normalize(q['text']) for q in qs})==38
practice=[q for q in qs if q['pool']=='practice'];reserved=[q for q in qs if q['pool']=='checkpoint_reserved']
assert len(practice)==28 and len(reserved)==10
assert Counter(q['primaryTopic'] for q in practice)==Counter({x:4 for x in TOPICS})
assert Counter(q['questionType'] for q in reserved)==Counter({x:2 for x in TYPES})
assert {q['questionType'] for q in practice}==TYPES
assert not ({q['exposureKey'] for q in practice}&{q['exposureKey'] for q in reserved})
verified=0
for q in qs:
 assert q['version']==1 and re.fullmatch(r'qb_mock_[a-z]+_\d{3}',q['id'])
 assert q['primaryTopic'] in TOPICS and q['questionType'] in TYPES
 assert set(q['secondaryTopics']) <= TOPICS-{q['primaryTopic']}
 assert len(q['secondaryTopics'])==len(set(q['secondaryTopics']))
 assert q['pool'] in {'practice','checkpoint_reserved'}
 assert 15<=len(q['text'].split())<=110 and q['text']== ' '.join(q['text'].split())
 assert not re.search(r'[\u4e00-\u9fff]|model essay|\[insert|lorem ipsum|task 1|pie chart',q['text'],re.I)
 typ=q['questionType']; t=q['text'].lower()
 if typ=='agree_disagree': assert 'agree or disagree' in t
 if typ=='discuss_both': assert 'discuss both' in t and 'opinion' in t
 if typ=='adv_disadv': assert 'outweigh' in t and 'disadvantages' in t
 if typ in {'problem_solution','two_part'}: assert t.count('?')>=2
 assert hashlib.sha256(canonical(q)).hexdigest()==manifest[q['id']],'Immutable record changed'
 src=q['source'];assert src['kind'] in {'local_excerpt','adapted_local','synthetic'}
 if src['kind']=='synthetic':
  assert all(src[k] is None for k in ['path','locator','sha256']) and q['id'] not in ev
  continue
 path=Path(src['path']);assert path.is_absolute() and str(path).startswith('/Users/chen/Desktop/雅思/')
 assert hashlib.sha256(path.read_bytes()).hexdigest()==src['sha256']
 e=ev[q['id']];p=e['pointer'];method=e['extraction']
 if method=='doc':
  ps=paragraphs(path); raw=ps[p[0]-1];assert ps[p[0]-2]=='原题'
 elif method=='band': raw=json.loads(path.read_text())[p[0]]['prompt']
 elif method=='md': raw=path.read_text().splitlines()[p[0]-1].split('**',2)[2]
 elif method=='trans': raw=json.loads(path.read_text())[p[0]][p[1]][1]
 else: raise AssertionError(method)
 assert raw==e['sourceExcerpt']
 if src['kind']=='local_excerpt': assert ' '.join(raw.split())==q['text']
 verified+=1
for f in read('source_inventory.json')['sources']:
 assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
pairs=[]
for a,b in combinations(qs,2):
 x,y=stem(a['text']),stem(b['text']);j=len(x&y)/len(x|y) if x|y else 0
 pairs.append({'first':a['id'],'second':b['id'],'contentTokenJaccard':round(j,3),'crossPool':a['pool']!=b['pool']})
pairs.sort(key=lambda p:p['contentTokenJaccard'],reverse=True)
# Lexical similarity is a screening aid, not semantic proof. See manual_review.json.
manual=read('manual_review.json')
assert manual['questionIds']==[q['id'] for q in qs]
assert manual['status']=='reviewed_no_duplicate_question_family_selected'
report={'status':'pass','bankVersion':bank['bankVersion'],'total':len(qs),'practice':len(practice),'reserved':len(reserved),'practicePrimaryTopicCounts':dict(sorted(Counter(q['primaryTopic'] for q in practice).items())),'practiceTypeCounts':dict(sorted(Counter(q['questionType'] for q in practice).items())),'reservedTypeCounts':dict(sorted(Counter(q['questionType'] for q in reserved).items())),'sourceKindCounts':dict(Counter(q['source']['kind'] for q in qs)),'sourceRecordsReextractedAndHashMatched':verified,'exactNormalizedDuplicateCount':0,'duplicateExposureKeyCount':0,'pairComparisons':len(pairs),'highestLexicalSimilarityPairs':pairs[:12],'manualReview':manual['status'],'limits':['Content labels and semantic family distinctness were reviewed by the preparing agent, not an independent IELTS examiner.','No web, official exam provenance, publication rights, visual DOCX layout, unseen-by-user eligibility or model-based learning outcomes verified.','A reserved pool is a design allocation; it does not prove that a particular user has never seen its questions.']}
(BASE/'validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['status','total','practice','reserved','sourceKindCounts','sourceRecordsReextractedAndHashMatched','exactNormalizedDuplicateCount']},ensure_ascii=False))
