#!/usr/bin/env python
"""Extract PNSQC proceedings metadata into archive content JSON."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

try:
    import pdfplumber
except ImportError as error:  # pragma: no cover - runtime environment guard
    raise SystemExit(
        "Missing Python dependency: pdfplumber. Install it with `python -m pip install pdfplumber`."
    ) from error


DEFAULT_AVATAR = "/images/brand/pnsqc-logo.jpg"
DEFAULT_LABEL = "Conference Paper"
DEFAULT_TITLE_SLUG_MAX_LENGTH = 50

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"https?://[^\s)>,]+")

SECTION_LABELS = [
    "Biographies",
    "Biography",
    "Author Bio",
    "About the Authors",
    "About the Author",
    "Bio",
    "Authors",
]

ABSTRACT_STOP_LABELS = SECTION_LABELS + [
    "Key Takeaways",
    "Index Terms",
    "Introduction",
    "1 Introduction",
    "1. Introduction",
]

BIO_STOP_LABELS = [
    "References and External Resources",
    "References",
    "1 Introduction",
    "1. Introduction",
    "Introduction",
]


@dataclass(frozen=True)
class ProceedingsSource:
    year: str
    pdf_url: str
    pdf_filename: str
    proceedings_page: Path


@dataclass(frozen=True)
class PaperSpec:
    index: int
    title: str
    page: int
    authors: list[str]
    raw_entry: str


def slugify(value: str) -> str:
    normalized = (
        value.replace("&", " and ")
        .replace("\u2019", "")
        .replace("'", "")
        .replace('"', "")
        .replace("\u201c", "")
        .replace("\u201d", "")
        .lower()
    )
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-")


def short_title_slug(title: str, used: set[str], max_length: int) -> str:
    base = slugify(title)[:max_length].strip("-")
    if not base:
        base = "presentation"
    candidate = base
    index = 2
    while candidate in used:
        suffix = f"-{index}"
        candidate = f"{base[:max_length - len(suffix)].strip('-')}{suffix}"
        index += 1
    used.add(candidate)
    return candidate


def is_footer_line(line: str) -> bool:
    stripped = line.strip()
    return (
        not stripped
        or stripped.isdigit()
        or stripped == "Page"
        or stripped.startswith("Excerpt from PNSQC Proceedings")
        or stripped.startswith("Copies may not be made or distributed")
        or stripped.startswith("PNSQC.ORG Page")
        or re.match(r"^Page\s+\d+$", stripped) is not None
        or re.match(r"^\u00a9 \d{4} .+ Page \d+$", stripped) is not None
    )


def clean_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if not is_footer_line(line)]


def reflow_lines(lines: list[str]) -> str:
    blocks: list[str] = []
    current = ""
    current_is_bullet = False
    bullet_pattern = re.compile(r"^[\u2022\u25cf\uf0b7\u25aa]\s*(.+)$")

    def flush() -> None:
        nonlocal current, current_is_bullet
        if current.strip():
            blocks.append(current.strip())
        current = ""
        current_is_bullet = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            flush()
            continue

        bullet_match = bullet_pattern.match(line)
        if bullet_match:
            flush()
            current = f"- {bullet_match.group(1).strip()}"
            current_is_bullet = True
            continue

        if current:
            if current.endswith("-"):
                current = f"{current}{line}"
            elif current_is_bullet:
                current = f"{current} {line}"
            else:
                current = f"{current} {line}"
        else:
            current = line

    flush()
    return "\n\n".join(blocks).strip()


def reflow_text(text: str) -> str:
    return reflow_lines(clean_lines(text))


def find_line_label(text: str, labels: list[str], start: int = 0) -> tuple[int, int, str] | None:
    matches: list[tuple[int, int, str]] = []
    for label in labels:
        pattern = re.compile(rf"(?m)^{re.escape(label)}(?:\s*[\u2014-]\s*)?")
        match = pattern.search(text, start)
        if match:
            matches.append((match.start(), match.end(), label))
    return min(matches, default=None, key=lambda item: item[0])


def find_stop(text: str, labels: list[str], start: int) -> int:
    label_match = find_line_label(text, labels, start)
    positions = [len(text)]
    if label_match:
        positions.append(label_match[0])
    footer_match = re.search(r"(?m)^Excerpt from PNSQC Proceedings", text[start:])
    if footer_match:
        positions.append(start + footer_match.start())
    return min(positions)


def variants_for_author(name: str) -> list[str]:
    variants = [
        name,
        name.replace("'", "\u2019"),
        name.replace("\u2019", "'"),
        name.replace("\u201c", '"').replace("\u201d", '"'),
    ]
    if '"' in name or "\u201c" in name:
        variants.append(re.sub(r'\s*["\u201c][^"\u201d]+["\u201d]\s*', " ", name).strip())
    return list(dict.fromkeys([variant for variant in variants if variant]))


def extract_title(first_page_text: str, authors: list[dict[str, str]]) -> str:
    lines = clean_lines(first_page_text)
    author_markers = []
    for author in authors:
        author_markers.extend(variants_for_author(author["name"]))

    title_lines: list[str] = []
    for line in lines:
        if line == "Abstract" or line.startswith("Abstract "):
            break
        if "@" in line:
            break
        if line.startswith("Author:"):
            break
        if any(marker and marker in line for marker in author_markers):
            break
        title_lines.append(line)

    return reflow_lines(title_lines)


def header_end_index(first_page_text: str) -> int:
    lines = first_page_text.splitlines()
    offset = 0
    last_header_end = 0
    for line in lines:
        stripped = line.strip()
        end = offset + len(line) + 1
        if "@" in stripped or stripped.startswith("Author:"):
            last_header_end = end
        offset = end
    return last_header_end


def extract_description(first_page_text: str) -> str:
    abstract_match = re.search(r"(?m)^Abstract(?:\s*[\u2014-]\s*)?", first_page_text)
    start = abstract_match.end() if abstract_match else header_end_index(first_page_text)
    stop = find_stop(first_page_text, ABSTRACT_STOP_LABELS, start)
    return reflow_text(first_page_text[start:stop])


def extract_biography(range_text: str) -> tuple[str, str, int | None]:
    label_match = find_line_label(range_text, SECTION_LABELS)
    if not label_match:
        return "", "", None
    start = label_match[1]
    stop = find_stop(range_text, BIO_STOP_LABELS, start)
    section = label_match[2]
    before = range_text[: label_match[0]]
    page_match = list(re.finditer(r"(?m)^(\d{1,3})$", before))
    page = int(page_match[-1].group(1)) if page_match else None
    return reflow_text(range_text[start:stop]), section, page


def split_biography_by_author(biography: str, authors: list[dict[str, str]]) -> dict[str, str]:
    if not biography:
        return {}

    if re.search(r"\b(authors|co-authors)\b", biography[:120], re.IGNORECASE):
        return {slugify(author["name"]): biography for author in authors}

    positions: list[tuple[int, str]] = []
    for author in authors:
        slug = slugify(author["name"])
        for variant in variants_for_author(author["name"]):
            match = re.search(rf"\b{re.escape(variant)}\b", biography)
            if match:
                positions.append((match.start(), slug))
                break

    if not positions:
        return {slugify(authors[0]["name"]): biography} if len(authors) == 1 else {}

    positions.sort()
    result: dict[str, str] = {}
    for index, (start, slug) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(biography)
        result[slug] = biography[start:end].strip()
    return result


def extract_profession(name: str, description: str, fallback: str = "") -> str:
    if fallback:
        return fallback.strip()
    if not description:
        return ""

    escaped_name = re.escape(name).replace("\\'", "[\u2019']")
    patterns = [
        rf"{escaped_name},?\s+(?:PhD,\s+)?is\s+(?:a|an|the)\s+(.+?)(?:\.| with | based |, where |, and )",
        rf"{escaped_name}\s+(.+?)\s+[\u2013-]\s+",
    ]
    for pattern in patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            return match.group(1).strip(" ,")
    return ""


def extract_organization(description: str, fallback: str = "") -> str:
    if fallback:
        return fallback.strip()
    patterns = [
        r"\bat\s+([A-Z][A-Za-z0-9&.\-/ ]+?)(?:,|\.|\sand\s)",
        r"\bwith\s+([A-Z][A-Za-z0-9&.\-/ ]+?)(?:,|\.)",
        r"\bfrom\s+([A-Z][A-Za-z0-9&.\-/ ]+?)(?:,|\.)",
    ]
    for pattern in patterns:
        match = re.search(pattern, description)
        if match:
            return match.group(1).strip(" ,")
    return ""


def root_relative(root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def find_proceedings_pdf_url(root: Path, year: str, proceedings_page: Path) -> str:
    if not proceedings_page.exists():
        raise SystemExit(f"Proceedings page not found: {root_relative(root, proceedings_page)}")
    html = proceedings_page.read_text(encoding="utf-8")
    hrefs = re.findall(r"""href=["']([^"']+\.pdf)["']""", html, flags=re.IGNORECASE)
    candidates = []
    for href in hrefs:
        filename = Path(urllib.parse.urlparse(href).path).name.lower()
        if year in filename:
            candidates.append(href)
    if not candidates:
        raise SystemExit(
            f"Could not find a proceedings PDF for {year} in {root_relative(root, proceedings_page)}"
        )
    return candidates[-1]


def build_source(
    root: Path,
    year: str,
    explicit_url: str | None,
    explicit_filename: str | None,
    proceedings_page_arg: str | None,
) -> ProceedingsSource:
    if not year or not year.strip():
        raise SystemExit("Provide --year so generated content can be written under content/<year>.")

    proceedings_page = (
        Path(proceedings_page_arg)
        if proceedings_page_arg
        else root / "src" / "archive" / "proceedings" / "index.html"
    )
    if not proceedings_page.is_absolute():
        proceedings_page = root / proceedings_page

    pdf_url = explicit_url or find_proceedings_pdf_url(root, year, proceedings_page)
    url_filename = Path(urllib.parse.urlparse(pdf_url).path).name
    pdf_filename = explicit_filename or url_filename or f"pnsqc{year}.pdf"
    return ProceedingsSource(
        year=year,
        pdf_url=pdf_url,
        pdf_filename=pdf_filename,
        proceedings_page=proceedings_page,
    )


def download_pdf(url: str, target: Path) -> Path:
    if not url:
        raise SystemExit("No PDF found locally and no PDF URL discovered. Pass --pdf or --pdf-url.")
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request) as response, target.open("wb") as output:
        shutil.copyfileobj(response, output)
    return target


def get_pdf_path(root: Path, source: ProceedingsSource, explicit_path: str | None) -> Path:
    if explicit_path:
        path = Path(explicit_path)
        return path if path.is_absolute() else root / path
    report_pdf = root / "pdf-report" / source.pdf_filename
    if report_pdf.exists():
        return report_pdf
    temp_pdf = Path(tempfile.gettempdir()) / source.pdf_filename
    if temp_pdf.exists():
        return temp_pdf
    return download_pdf(source.pdf_url, report_pdf)


def extract_pages(pdf_path: Path) -> dict[int, str]:
    with pdfplumber.open(str(pdf_path)) as pdf:
        return {
            page_number: pdf.pages[page_number - 1].extract_text(x_tolerance=1, y_tolerance=3) or ""
            for page_number in range(1, len(pdf.pages) + 1)
        }


def is_toc_noise(line: str) -> bool:
    return (
        line in {"Table of Contents", "Page", "Conference Papers"}
        or line.startswith("in alphabetical order")
        or line.startswith("This page is intentionally")
    )


def is_toc_end_line(line: str) -> bool:
    return line == "Forward" or line.startswith("Forward ")


def collect_toc_entries(page_text: dict[int, str], max_scan_pages: int = 30) -> list[str]:
    entries: list[str] = []
    current: list[str] = []
    in_toc = False
    saw_entry = False

    def flush() -> None:
        nonlocal current
        if current:
            entries.append(re.sub(r"\s+", " ", " ".join(current)).strip())
        current = []

    for page_number in sorted(page_text)[:max_scan_pages]:
        lines = clean_lines(page_text[page_number])
        if not in_toc:
            if any("Table of Contents" in line for line in lines):
                in_toc = True
            else:
                continue

        for line in lines:
            if is_toc_noise(line):
                continue
            if re.match(r"^\d+\.\s+", line):
                flush()
                current = [line]
                saw_entry = True
                continue
            if saw_entry and is_toc_end_line(line):
                flush()
                return entries
            if current:
                current.append(line)

    flush()
    return entries


def normalize_author_name(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ,;-")


def parse_author_names(authors_text: str) -> list[str]:
    normalized = re.sub(r"\bet\s+al\.?$", "", authors_text.strip(), flags=re.IGNORECASE)
    normalized = normalized.replace(" & ", " and ")
    normalized = re.sub(r"\s+and\s+", ", ", normalized)
    return [
        name
        for name in (normalize_author_name(part) for part in normalized.split(","))
        if name
    ]


def parse_toc_entry(raw_entry: str) -> PaperSpec | None:
    ordinal_match = re.match(r"^(\d+)\.\s+(.+)$", raw_entry)
    if not ordinal_match:
        return None

    index = int(ordinal_match.group(1))
    body = ordinal_match.group(2)
    page_matches = list(re.finditer(r"(?<![A-Za-z0-9])(\d{1,4})(?![A-Za-z0-9])", body))
    if not page_matches:
        return None

    page_match = page_matches[-1]
    page = int(page_match.group(1))
    body_without_page = re.sub(
        r"\s+",
        " ",
        f"{body[: page_match.start()]} {body[page_match.end():]}",
    ).strip()
    parts = re.split(r"\s+[\u2013\u2014-]\s+by\s+", body_without_page, maxsplit=1, flags=re.IGNORECASE)
    if len(parts) != 2:
        return None

    title = parts[0].strip(" -\u2013\u2014")
    authors = parse_author_names(parts[1])
    if not title or not authors:
        return None

    return PaperSpec(index=index, title=title, page=page, authors=authors, raw_entry=raw_entry)


def extract_paper_specs(page_text: dict[int, str]) -> list[PaperSpec]:
    entries = collect_toc_entries(page_text)
    specs = [spec for entry in entries if (spec := parse_toc_entry(entry))]
    if not specs:
        raise SystemExit("Could not discover conference papers from the PDF table of contents.")
    return sorted(specs, key=lambda spec: spec.page)


def dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys([value for value in values if value]))


def clean_url(value: str) -> str:
    return value.rstrip(".,;")


def line_contains_author(line: str, author_name: str) -> bool:
    compact_line = line.replace("\u2019", "'")
    for variant in variants_for_author(author_name):
        if variant.replace("\u2019", "'") in compact_line:
            return True
    name_parts = [part for part in re.split(r"\s+", author_name.replace(",", "")) if part]
    if len(name_parts) >= 2 and name_parts[0] in compact_line and name_parts[-1] in compact_line:
        return True
    return False


def repeated_orgs(tokens: list[str], count: int) -> list[str]:
    if count <= 1:
        return [" ".join(tokens)] if tokens else []
    for chunk_size in range(1, len(tokens) // count + 1):
        chunk = tokens[:chunk_size]
        if chunk * count == tokens:
            return [" ".join(chunk)] * count
    return []


def split_organizations(text: str, count: int) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip(" ,;-\u2013")
    if not text:
        return []
    if count == 1:
        return [text]

    comma_parts = [part.strip() for part in text.split(",") if part.strip()]
    if len(comma_parts) == count:
        return comma_parts

    tokens = text.split()
    repeated = repeated_orgs(tokens, count)
    if repeated:
        return repeated

    if count == 2 and len(tokens) > 1 and tokens[-1].isupper():
        return [" ".join(tokens[:-1]), tokens[-1]]

    if count == 2 and len(tokens) % 2 == 0:
        middle = len(tokens) // 2
        return [" ".join(tokens[:middle]), " ".join(tokens[middle:])]

    return []


def parse_profession_and_organization(value: str) -> tuple[str, str]:
    cleaned = re.sub(r"\s+", " ", value).strip(" ,;-\u2013")
    if not cleaned:
        return "", ""
    if "," in cleaned:
        profession, organization = cleaned.rsplit(",", 1)
        return profession.strip(" ,;-\u2013"), organization.strip(" ,;-\u2013")
    return "", cleaned


def extract_header_organization_data(
    first_page_text: str,
    author_names: list[str],
) -> tuple[list[str], list[str]]:
    lines = clean_lines(first_page_text)
    first_email_index = next((index for index, line in enumerate(lines) if EMAIL_RE.search(line)), None)
    if first_email_index is None:
        return [], []

    last_author_index = -1
    for index, line in enumerate(lines[:first_email_index]):
        if any(line_contains_author(line, author_name) for author_name in author_names):
            last_author_index = index

    candidates: list[str] = []
    if last_author_index >= 0:
        for line in lines[last_author_index + 1 : first_email_index]:
            if URL_RE.search(line):
                continue
            if any(line_contains_author(line, author_name) for author_name in author_names):
                continue
            candidates.append(line)

    for line in lines:
        if not EMAIL_RE.search(line):
            continue
        leftover = EMAIL_RE.sub("", line)
        leftover = URL_RE.sub("", leftover)
        leftover = re.sub(r"\s+", " ", leftover).strip(" ,;-\u2013")
        if leftover and not any(line_contains_author(leftover, author_name) for author_name in author_names):
            candidates.append(leftover)

    if not candidates:
        return [], []

    if len(author_names) == 1:
        profession, organization = parse_profession_and_organization(" ".join(candidates))
        return [organization] if organization else [], [profession] if profession else []

    organizations = split_organizations(" ".join(candidates), len(author_names))
    return organizations, []


def enrich_authors_from_page(first_page_text: str, author_names: list[str]) -> list[dict[str, str]]:
    authors = [{"name": name} for name in author_names]
    header_text = first_page_text[: find_stop(first_page_text, ABSTRACT_STOP_LABELS, 0)]
    emails = dedupe(EMAIL_RE.findall(header_text))
    urls = dedupe([clean_url(url) for url in URL_RE.findall(header_text)])
    organizations, professions = extract_header_organization_data(header_text, author_names)

    if len(emails) == len(authors):
        for author, email in zip(authors, emails):
            author["email"] = email
    elif len(authors) == 1 and emails:
        authors[0]["email"] = " or ".join(emails)
    elif len(emails) == 1:
        for author in authors:
            author["email"] = emails[0]
    else:
        for author, email in zip(authors, emails):
            author["email"] = email

    if len(organizations) == len(authors):
        for author, organization in zip(authors, organizations):
            author["organization"] = organization

    if len(professions) == len(authors):
        for author, profession in zip(authors, professions):
            author["profession"] = profession

    if len(authors) == 1 and urls:
        linkedin = next((url for url in urls if "linkedin.com" in url), "")
        if linkedin:
            authors[0]["linkedin"] = linkedin
        else:
            authors[0]["homepage"] = urls[0]
    elif len(urls) == len(authors):
        for author, url in zip(authors, urls):
            if "linkedin.com" in url:
                author["linkedin"] = url
            else:
                author["homepage"] = url

    return authors


def read_existing_json_files(root: Path, year: str) -> tuple[dict[str, dict], dict[str, dict]]:
    bios: dict[str, dict] = {}
    presentations: dict[str, dict] = {}

    for base in [root / "content" / "speakers", root / "content" / "bios"]:
        if not base.exists():
            continue
        for file_path in base.glob("*/index.json"):
            bios[file_path.parent.name] = json.loads(file_path.read_text(encoding="utf-8"))
        for file_path in base.glob("*/about.json"):
            bios[file_path.parent.name] = json.loads(file_path.read_text(encoding="utf-8"))

    year_dir = root / "content" / year
    if year_dir.exists():
        for file_path in list(year_dir.glob("*/index.json")) + list(year_dir.glob("*/about.json")):
            data = json.loads(file_path.read_text(encoding="utf-8"))
            title = data.get("title") or data.get("presentations", [{}])[0].get("title", "")
            if title:
                presentations[title] = data

    return bios, presentations


def status_for_existing(slug_or_title: str, existing: dict[str, dict], data: dict) -> str:
    if slug_or_title not in existing:
        return "new"
    comparable = existing[slug_or_title].copy()
    if "bio" in comparable and "description" not in comparable:
        comparable["description"] = comparable.pop("bio")
    return "unchanged" if comparable == data else "changed"


def base_presentation_refs(existing: dict, year: str) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    for ref in existing.get("presentations", []):
        if not isinstance(ref, dict):
            continue
        slug = ref.get("slug")
        ref_year = ref.get("year")
        if isinstance(slug, str) and slug.strip() and str(ref_year) != year:
            refs.append({"slug": slug, "year": str(ref_year)})
    return refs


def build_extraction(
    root: Path,
    pdf_path: Path,
    source: ProceedingsSource,
) -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    page_text = extract_pages(pdf_path)
    paper_specs = extract_paper_specs(page_text)
    existing_bios, existing_presentations = read_existing_json_files(root, source.year)
    papers: list[dict] = []
    bios: dict[str, dict] = {}
    presentation_slugs: set[str] = set()
    presentations: dict[str, dict] = {}

    starts = [paper.page for paper in paper_specs]
    for index, paper_spec in enumerate(paper_specs):
        start_page = paper_spec.page
        end_page = (starts[index + 1] - 1) if index + 1 < len(starts) else start_page
        if start_page not in page_text:
            raise SystemExit(f"{source.pdf_filename} does not have page {start_page}")
        first_page_text = page_text[start_page]
        range_text = "\n".join(
            page_text[page] for page in range(start_page, end_page + 1) if page in page_text
        )

        authors = enrich_authors_from_page(first_page_text, paper_spec.authors)
        title = extract_title(first_page_text, authors) or paper_spec.title
        description = extract_description(first_page_text)
        biography, biography_section, biography_page = extract_biography(range_text)
        author_descriptions = split_biography_by_author(biography, authors)
        author_slugs = [slugify(author["name"]) for author in authors]

        presentation_slug = short_title_slug(title, presentation_slugs, DEFAULT_TITLE_SLUG_MAX_LENGTH)
        presentation = {
            "title": title,
            "description": description,
            "label": DEFAULT_LABEL,
            "authors": author_slugs,
            "source": {
                "proceedings": source.pdf_filename,
                "page": start_page,
            },
        }
        presentations[presentation_slug] = presentation

        for author in authors:
            slug = slugify(author["name"])
            existing = existing_bios.get(slug, {})
            presentation_refs = bios.get(slug, {}).get(
                "presentations",
                base_presentation_refs(existing, source.year),
            )
            presentation_ref = {"slug": presentation_slug, "year": source.year}
            if presentation_ref not in presentation_refs:
                presentation_refs = [*presentation_refs, presentation_ref]

            author_description = author_descriptions.get(slug, "")
            previous_description = bios.get(slug, {}).get("description", "")
            if previous_description and len(previous_description) > len(author_description):
                author_description = previous_description
                bio_source = bios[slug]["source"]
            else:
                bio_source = {
                    "proceedings": source.pdf_filename,
                    "page": biography_page or start_page,
                    "section": biography_section,
                }
            if not author_description and isinstance(existing.get("description"), str):
                author_description = existing["description"]
                bio_source = existing.get("source", bio_source)

            avatar = existing.get("avatar", DEFAULT_AVATAR) or DEFAULT_AVATAR
            linkedin = author.get("linkedin") or existing.get("linkedin", "")
            homepage = author.get("homepage") or existing.get("homepage", "")
            profession = extract_profession(
                author["name"],
                author_description,
                author.get("profession") or existing.get("profession", ""),
            )
            organization = author.get("organization") or extract_organization(
                author_description,
                existing.get("organization", ""),
            )

            if avatar == DEFAULT_AVATAR and existing.get("avatar", "") not in ("", DEFAULT_AVATAR):
                avatar = existing["avatar"]

            bios[slug] = {
                "name": author["name"],
                "profession": profession,
                "avatar": avatar,
                "linkedin": linkedin,
                "homepage": homepage,
                "email": author.get("email", existing.get("email", "")),
                "organization": organization,
                "description": author_description,
                "presentations": presentation_refs,
                "source": bio_source,
            }

        papers.append(
            {
                "title": title,
                "tocTitle": paper_spec.title,
                "slug": presentation_slug,
                "page": start_page,
                "tocEntry": paper_spec.raw_entry,
                "authors": [
                    {
                        "name": author["name"],
                        "slug": slugify(author["name"]),
                        "email": author.get("email", ""),
                        "organization": author.get("organization", ""),
                        "homepage": author.get("homepage", ""),
                        "linkedin": author.get("linkedin", ""),
                    }
                    for author in authors
                ],
                "abstract": description,
                "biography": biography,
                "biographySection": biography_section,
                "biographyPage": biography_page,
                "matchStatus": {
                    "presentation": status_for_existing(
                        title,
                        existing_presentations,
                        presentation,
                    ),
                },
            }
        )

    for slug, bio in bios.items():
        bio["matchStatus"] = status_for_existing(slug, existing_bios, bio)

    return papers, bios, presentations


def write_json(path: Path, data: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def assert_safe_content_path(root: Path, path: Path) -> None:
    resolved_root = (root / "content").resolve()
    resolved_path = path.resolve()
    if resolved_root not in [resolved_path, *resolved_path.parents]:
        raise RuntimeError(f"Refusing to mutate outside content directory: {resolved_path}")


def write_content(
    root: Path,
    source: ProceedingsSource,
    bios: dict[str, dict],
    presentations: dict[str, dict],
) -> None:
    content_dir = root / "content"
    bios_dir = content_dir / "bios"
    speakers_dir = content_dir / "speakers"
    year_dir = content_dir / source.year

    for target in [speakers_dir, year_dir]:
        assert_safe_content_path(root, target)
        if target.exists():
            shutil.rmtree(target)

    assert_safe_content_path(root, bios_dir)
    bios_dir.mkdir(parents=True, exist_ok=True)
    for legacy_index in bios_dir.glob("*/index.json"):
        legacy_index.unlink()

    for slug, bio in sorted(bios.items()):
        content = {key: value for key, value in bio.items() if key != "matchStatus"}
        write_json(bios_dir / slug / "about.json", content)

    for slug, presentation in sorted(presentations.items()):
        write_json(year_dir / slug / "about.json", presentation)


def build_report(
    root: Path,
    source: ProceedingsSource,
    pdf_path: Path,
    papers: list[dict],
    bios: dict[str, dict],
    presentations: dict[str, dict],
) -> dict:
    return {
        "source": {
            "url": source.pdf_url,
            "pdf": str(pdf_path),
            "proceedings": source.pdf_filename,
            "year": source.year,
            "proceedingsPage": root_relative(root, source.proceedings_page),
        },
        "summary": {
            "papers": len(papers),
            "authors": len(bios),
            "presentations": len(presentations),
        },
        "papers": papers,
        "bios": [{**bio, "slug": slug} for slug, bio in sorted(bios.items())],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", required=True, help="Proceedings year to extract.")
    parser.add_argument("--pdf", help="Path to an already downloaded proceedings PDF.")
    parser.add_argument("--pdf-url", "--url", dest="pdf_url", help="Override PDF download URL.")
    parser.add_argument("--pdf-filename", help="Override proceedings PDF filename in source metadata.")
    parser.add_argument(
        "--proceedings-page",
        help="Path to the local archive proceedings HTML page used to discover PDF links.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Rewrite content/bios entries for extracted authors and content/<year> presentations.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    source = build_source(
        root,
        args.year,
        args.pdf_url,
        args.pdf_filename,
        args.proceedings_page,
    )
    pdf_path = get_pdf_path(root, source, args.pdf)
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    papers, bios, presentations = build_extraction(root, pdf_path, source)
    report = build_report(root, source, pdf_path, papers, bios, presentations)
    report_path = root / "pdf-report" / f"{source.year}-extraction.json"
    write_json(report_path, report)

    if args.write:
        write_content(root, source, bios, presentations)

    print(
        f"Extracted {len(papers)} papers, {len(bios)} authors, "
        f"{len(presentations)} presentations for {source.year}."
    )
    print(f"Wrote {root_relative(root, report_path)}")
    if args.write:
        print(f"Rewrote content/bios entries and content/{source.year}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
