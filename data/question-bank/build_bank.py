from pathlib import Path
import json, hashlib, re, zipfile, xml.etree.ElementTree as ET
from collections import Counter
OUT=Path(__file__).resolve().parent
ROOT=Path('/Users/chen/Desktop/雅思')
DOC=ROOT/'雅思大作文Top18_图片文字摘录.docx'
BAND=ROOT/'tmp/1010-public-topics/band_verified.json'
TRANS=ROOT/'tmp/1010-public-topics/writing_translations.json'
MD=ROOT/'雅思A类写作8分备考宝典.md'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def paras(p):
 r=ET.fromstring(zipfile.ZipFile(p).read('word/document.xml'))
 return [''.join(t.text or '' for t in x.findall('.//w:t',ns)) for x in r.findall('.//w:p',ns)]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def norm(t): return ' '.join(t.split())
doc=paras(DOC); band=json.loads(BAND.read_text()); trans=json.loads(TRANS.read_text()); lines=MD.read_text().splitlines()
qs=[]; evidence=[]; counts=Counter()
ABBR=dict(education='edu',technology='tech',environment='env',society='soc',work='work',health='health',culture='culture')
def add(topic,typ,family,source,secondary=(),pool='practice',text=None):
 counts[topic]+=1; qid=f'qb_mock_{ABBR[topic]}_{counts[topic]:03d}'
 if source[0]=='doc':
  p=DOC; loc=f'word/document.xml paragraph {source[1]} (1-based, all w:p including empty/table paragraphs)'; raw=doc[source[1]-1]; kind='local_excerpt'; note='Extracted only the paragraph immediately after 原题. Local document attribution is not independent verification of a past exam or publication rights.'
 elif source[0]=='band':
  p=BAND; loc=f'$[{source[1]}].prompt'; raw=band[source[1]]['prompt']; kind='local_excerpt'; note='Exact local JSON prompt; its legacy verified flag and external URL were not revalidated and do not establish official exam provenance.'
 elif source[0]=='md':
  p=MD; loc=f'line {source[1]}, section 10.5 Task 2'; raw=lines[source[1]-1].split('**',2)[2]; kind='local_excerpt'; note='Source explicitly labels this as an original practice question; extracted prompt only, excluding model essay.'
 elif source[0]=='trans':
  p=TRANS; loc=f'$.{source[1]}[{source[2]}][1]'; raw=trans[source[1]][source[2]][1]; kind='adapted_local'; note=source[3]
 else:
  p=None;loc=None;raw=None;kind='synthetic';note='New mock prompt composed for this bank to fill a topic/type gap; not a claimed past exam question.'
 q={'id':qid,'version':1,'exposureKey':'qfamily_'+family,'bankOrder':len(qs)+1,'text':norm(text if text is not None else raw),'primaryTopic':topic,'secondaryTopics':list(secondary),'questionType':typ,'pool':pool,'source':{'kind':kind,'path':str(p) if p else None,'locator':loc,'sha256':sha(p) if p else None,'note':note}}
 qs.append(q)
 if raw is not None: evidence.append({'questionId':qid,'sourceExcerpt':raw,'extraction':source[0],'pointer':source[1:3] if source[0]=='trans' else [source[1]]})
# Practice: exactly four questions per primary topic.
add('education','adv_disadv','university_living_away',('band',10),['society'])
add('education','two_part','science_subject_shortage',('band',15),['technology'])
add('education','discuss_both','math_vs_communication_curriculum',('trans','simply',0,'Translated the complete Chinese local prompt into English; no original English wording is claimed.'),text='Some people think schools should spend more time teaching mathematics and numerical skills. Others believe communication skills, such as writing and speaking, are more important for students\' futures. Discuss both views and give your own opinion.')
add('education','agree_disagree','school_uniform_requirement',('new',),text='All secondary schools should require their students to wear a school uniform. To what extent do you agree or disagree?')
add('technology','discuss_both','technology_crime_effect',('doc',71),['society'])
add('technology','adv_disadv','private_scientific_research',('doc',100))
add('technology','adv_disadv','corporate_personal_data',('doc',245),['society'])
add('technology','adv_disadv','social_media_contact_news',('band',14),['society'])
add('environment','agree_disagree','wildlife_resource_allocation',('doc',187))
add('environment','agree_disagree','climate_adaptation_vs_prevention',('doc',274))
add('environment','discuss_both','biodiversity_action_too_late',('doc',303))
add('environment','discuss_both','freshwater_use_control',('doc',419),['society'])
add('society','adv_disadv','city_functional_zoning',('doc',42))
add('society','agree_disagree','mandatory_parent_training',('doc',129),['education'])
add('society','agree_disagree','crime_reporting_restriction',('doc',158))
add('society','agree_disagree','city_public_outdoor_spaces',('band',0))
add('work','agree_disagree','career_stability_changes',('band',1))
add('work','adv_disadv','remote_work',('md',1184),['technology'])
add('work','two_part','legal_working_hours_limits',('band',16),['society'])
add('work','discuss_both','national_salary_cap',('doc',535),['society'])
add('health','problem_solution','obesity_unhealthy_eating_prevention',('doc',361))
add('health','agree_disagree','illness_pollution_housing_prevention',('band',3),['environment','society'])
add('health','discuss_both','healthcare_tax_spending_priority',('doc',216),['society'])
add('health','two_part','adults_sleep_loss_effects',('new',),text='In many societies, adults sleep fewer hours than they did in the past. Why is this happening? How can a lack of sleep affect individuals and the people around them?')
add('culture','agree_disagree','live_vs_televised_performance',('band',4),['technology'])
add('culture','agree_disagree','responsible_tourism_possible',('doc',390),['environment'])
add('culture','discuss_both','public_libraries_vs_internet',('doc',332),['education','technology'])
add('culture','agree_disagree','endangered_language_public_funding',('trans','simply',9,'Translated a local topic statement and supplied a complete agree/disagree instruction absent from the source. This is an adapted practice prompt, not an exact past question.'),text='Governments should provide funding to preserve endangered languages. To what extent do you agree or disagree?')
# Reserved: exactly two per type, disjoint question families.
R='checkpoint_reserved'
add('work','agree_disagree','working_in_old_age',('band',2),['health'],R)
add('technology','agree_disagree','computers_smarter_than_humans',('trans','sohu',3,'Translated the complete Chinese local prompt into English; original English wording and exam provenance were not verified.'),pool=R,text='Computers are becoming more intelligent than human beings, and some people believe this is a negative development. To what extent do you agree or disagree?')
add('technology','discuss_both','alien_life_public_spending',('band',7),['society'],R)
add('society','discuss_both','modern_independence_dependence',('band',8),pool=R)
add('work','adv_disadv','work_relocation_family_friends',('band',11),['society'],R)
add('society','adv_disadv','economic_development_social_values',('band',13),['culture'],R)
add('society','problem_solution','declining_bicycle_transport',('band',17),['environment','health'],R)
add('culture','problem_solution','historic_building_neglect',('new',),pool=R,text='In many towns, historic buildings are falling into disrepair because they are no longer maintained. What problems can this cause for local communities? What measures could be taken to address this situation?')
add('education','two_part','parental_success_pressure',('band',18),['society'],R)
add('society','two_part','national_success_non_economic_measures',('doc',477),pool=R)
bank={'bankVersion':'mock-20261101-v1','status':'mock_not_production','questions':qs}
def save(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
save('question_bank.mock.json',bank)
save('provenance_evidence.json',evidence)
save('record_manifest.json',{'bankVersion':bank['bankVersion'],'rule':'Published mock records are immutable by id/version. Change prompt, classification, pool, or provenance by a new version; retain family exposureKey across wording variants.','records':{q['id']:hashlib.sha256(json.dumps(q,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest() for q in qs}})
# Focused inventory: inspected local writing sources, not a claim of exhaustive archive coverage.
rows=[]
for p,usable,detail in [(DOC,18,'18 English Task 2 paragraphs immediately following 原题; essays and idea chains excluded.'),(BAND,18,'19 complete English prompt rows, 18 question families: rows 11/12 are relocation wording variants. Two additional families overlap the Top18 document: healthcare-tax priority and modern interdependence.'),(MD,2,'Two explicit complete Task 2 prompts in sections 10.4/10.5; Task 1 and teaching examples excluded. Section 10.5 explicitly original.'),(TRANS,26,'34 Task 2 rows: 1 duplicate/merged placeholder excluded; 26 complete Chinese prompts usable by adaptation, plus 7 incomplete topic statements requiring supplied instructions. 18 Task 1 rows excluded. Overlaps English JSON; counts are not additive.'),(ROOT/'雅思作文整理版.docx',0,'676 XML paragraphs, a Task 1 handbook including appended Task 1 items; excluded.'),(ROOT/'雅思作文.docx',0,'142 XML paragraphs, Task 1 notes; excluded.')]:
 rows.append({'path':str(p),'sha256':sha(p),'usableCompleteTask2FamiliesWithinSource':usable,'selected':sum(q['source']['path']==str(p) for q in qs),'note':detail})
save('source_inventory.json',{'scope':'Focused inspection of six local writing files; not a complete scan of listening, reading, speaking, image-only, or other archive files. No web calls.','sources':rows,'englishCompleteCandidateFamilyCountAcrossDocBandMd':36,'englishCountFormula':'18 + 18 + 2 - 2 overlapping families = 36','selectedBySourceKind':dict(Counter(q['source']['kind'] for q in qs)),'selectedEnglishExcerpts':32,'newEnglishWording':6,'generatedBreakdown':{'adapted_local':3,'synthetic':3}})
print(Counter(q['source']['kind'] for q in qs))
