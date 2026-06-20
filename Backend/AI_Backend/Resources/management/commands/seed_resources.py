"""
Management command: python manage.py seed_resources
Populates the Resource collection with a curated starter set.
Safe to re-run — skips entries whose URL already exists.
"""
from django.core.management.base import BaseCommand
from Resources.models import Resource

SEED_DATA = [
    # ── Grammar ───────────────────────────────────────────────────────────────
    {
        "Title": "English Grammar in Use – Online Practice",
        "Url": "https://www.cambridge.org/elt/blog/2019/10/08/english-grammar-in-use-app/",
        "Description": "Cambridge's leading grammar reference with interactive exercises covering all major grammar points.",
        "Type": "exercise",
        "Source": "Cambridge University Press",
        "Categories": ["grammar"],
        "Tags": ["tense", "verb form", "conditional", "relative clause", "subject-verb"],
        "Cefr_Levels": ["A2", "B1", "B2"],
    },
    {
        "Title": "BBC Learning English – Grammar",
        "Url": "https://www.bbc.co.uk/learningenglish/english/course/intermediate/unit1/session1",
        "Description": "Short video lessons and quizzes covering everyday English grammar mistakes.",
        "Type": "video",
        "Source": "BBC Learning English",
        "Categories": ["grammar"],
        "Tags": ["tense shift", "article", "preposition", "word order"],
        "Cefr_Levels": ["A2", "B1", "B2"],
    },
    {
        "Title": "Perfect English Grammar – All Topics",
        "Url": "https://www.perfect-english-grammar.com/",
        "Description": "Free downloadable worksheets and clear explanations for every major grammar rule.",
        "Type": "website",
        "Source": "Perfect English Grammar",
        "Categories": ["grammar"],
        "Tags": ["subject-verb", "tense", "passive", "conditional", "pronoun"],
        "Cefr_Levels": ["A1", "A2", "B1", "B2"],
    },
    {
        "Title": "British Council – Grammar Reference",
        "Url": "https://learnenglish.britishcouncil.org/grammar",
        "Description": "Structured grammar lessons with practice activities from beginner to advanced.",
        "Type": "exercise",
        "Source": "British Council",
        "Categories": ["grammar"],
        "Tags": ["agreement", "tense", "verb form", "article", "preposition"],
        "Cefr_Levels": ["A1", "A2", "B1", "B2", "C1"],
    },
    # ── Punctuation ───────────────────────────────────────────────────────────
    {
        "Title": "Grammarly – Comma Guide",
        "Url": "https://www.grammarly.com/blog/comma/",
        "Description": "Comprehensive guide to comma usage including comma splices, Oxford commas, and common errors.",
        "Type": "article",
        "Source": "Grammarly Blog",
        "Categories": ["punctuation"],
        "Tags": ["comma", "comma splice", "run-on", "sentence fragment"],
        "Cefr_Levels": ["A2", "B1", "B2", "C1"],
    },
    {
        "Title": "Purdue OWL – Punctuation",
        "Url": "https://owl.purdue.edu/owl/general_writing/punctuation/index.html",
        "Description": "Authoritative punctuation reference covering all marks: commas, semicolons, apostrophes, colons.",
        "Type": "article",
        "Source": "Purdue Online Writing Lab",
        "Categories": ["punctuation"],
        "Tags": ["comma", "semicolon", "apostrophe", "colon", "quotation", "period"],
        "Cefr_Levels": ["B1", "B2", "C1", "C2"],
    },
    {
        "Title": "Apostrophe Protection Society – Guide",
        "Url": "https://www.bbc.co.uk/programmes/articles/5JKVb7GLMHX2RBBFpHfHGd4/10-common-apostrophe-mistakes",
        "Description": "BBC guide to the most common apostrophe mistakes with clear examples.",
        "Type": "article",
        "Source": "BBC",
        "Categories": ["punctuation"],
        "Tags": ["apostrophe"],
        "Cefr_Levels": ["A2", "B1", "B2"],
    },
    # ── Vocabulary ────────────────────────────────────────────────────────────
    {
        "Title": "Vocabulary.com – Build Your Word List",
        "Url": "https://www.vocabulary.com/",
        "Description": "Adaptive vocabulary learning that personalises to your level with spaced repetition.",
        "Type": "exercise",
        "Source": "Vocabulary.com",
        "Categories": ["vocabulary"],
        "Tags": ["word choice", "spelling", "synonym", "vocabulary"],
        "Cefr_Levels": ["A2", "B1", "B2", "C1"],
    },
    {
        "Title": "Merriam-Webster – Word of the Day",
        "Url": "https://www.merriam-webster.com/word-of-the-day",
        "Description": "Daily vocabulary expansion with etymology, example sentences, and pronunciation.",
        "Type": "website",
        "Source": "Merriam-Webster",
        "Categories": ["vocabulary"],
        "Tags": ["vocabulary", "word choice", "collocation"],
        "Cefr_Levels": ["B1", "B2", "C1", "C2"],
    },
    {
        "Title": "English Collocations in Use – Cambridge",
        "Url": "https://www.cambridge.org/gb/cambridgeenglish/catalog/grammar-vocabulary-and-pronunciation/english-collocations-use-intermediate",
        "Description": "Focuses on the most important collocations for natural-sounding English writing.",
        "Type": "book",
        "Source": "Cambridge University Press",
        "Categories": ["vocabulary"],
        "Tags": ["collocation", "word choice", "idiom"],
        "Cefr_Levels": ["B1", "B2", "C1"],
    },
    {
        "Title": "BBC Learning English – Spelling",
        "Url": "https://www.bbc.co.uk/learningenglish/english/course/lower-intermediate/unit1/session3",
        "Description": "Spelling rules and common errors explained with audio examples.",
        "Type": "video",
        "Source": "BBC Learning English",
        "Categories": ["vocabulary"],
        "Tags": ["spelling"],
        "Cefr_Levels": ["A1", "A2", "B1"],
    },
    # ── Writing Style ─────────────────────────────────────────────────────────
    {
        "Title": "Purdue OWL – Paragraph Development",
        "Url": "https://owl.purdue.edu/owl/general_writing/the_writing_process/developing_an_outline/paragraph_development.html",
        "Description": "Clear guidance on structuring paragraphs with topic sentences, evidence, and transitions.",
        "Type": "article",
        "Source": "Purdue Online Writing Lab",
        "Categories": ["writing_style"],
        "Tags": ["paragraph", "coherence", "cohesion", "transition"],
        "Cefr_Levels": ["B1", "B2", "C1"],
    },
    {
        "Title": "British Council – Writing Skills",
        "Url": "https://learnenglish.britishcouncil.org/skills/writing",
        "Description": "Graded writing lessons covering emails, essays, reports, and creative writing.",
        "Type": "exercise",
        "Source": "British Council",
        "Categories": ["writing_style", "grammar"],
        "Tags": ["clarity", "coherence", "paragraph", "transition"],
        "Cefr_Levels": ["A1", "A2", "B1", "B2"],
    },
    {
        "Title": "Hemingway Editor – Clarity & Conciseness",
        "Url": "https://hemingwayapp.com/",
        "Description": "Paste your writing to instantly see readability grade, passive voice, and overly complex sentences.",
        "Type": "website",
        "Source": "Hemingway App",
        "Categories": ["writing_style"],
        "Tags": ["clarity", "conciseness", "passive", "repetition"],
        "Cefr_Levels": ["B1", "B2", "C1", "C2"],
    },
    {
        "Title": "EnglishAddict – Advanced Writing Techniques",
        "Url": "https://www.youtube.com/@EnglishAddict",
        "Description": "YouTube channel covering advanced writing, grammar, and vocabulary for serious learners.",
        "Type": "video",
        "Source": "YouTube – EnglishAddict",
        "Categories": ["writing_style", "grammar", "vocabulary"],
        "Tags": ["coherence", "word choice", "tense", "passive"],
        "Cefr_Levels": ["B2", "C1", "C2"],
    },
]


class Command(BaseCommand):
    help = "Seed the Resource collection with curated starter resources"

    def handle(self, *args, **options):
        created = skipped = 0
        for entry in SEED_DATA:
            existing = list(Resource.objects.filter(Url=entry["Url"]))
            if existing:
                skipped += 1
                continue
            Resource.objects.create(**entry)
            created += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Done — {created} resources created, {skipped} already existed."
            )
        )
