#!/usr/bin/env python3
"""
Fetch publications from NASA ADS API and save to Hugo data file.
"""

import os
import json
import requests
from datetime import datetime, timezone

def fetch_ads_publications(token, orcid):
    """Fetch publications from ADS API using ORCID."""
    
    base_url = "https://api.adsabs.harvard.edu/v1/search/query"
    
    # Query parameters
    params = {
        'q': f'orcid:{orcid}',
        'fl': 'bibcode,identifier,title,author,first_author,pubdate,pub,abstract,doi,arxiv_class,citation_count,read_count,property,metrics',
        'sort': 'date desc',
        'rows': 100  # Adjust as needed
    }
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(base_url, params=params, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        return data.get('response', {}).get('docs', [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching publications: {e}")
        return []

def process_publication(pub):
    """Process a single publication record."""
    
    # Extract year from pubdate (format: YYYY-MM-DD or YYYY-MM)
    pubdate = pub.get('pubdate', '')
    year = ''
    if pubdate:
        year = pubdate.split('-')[0]
    
    # Get authors and determine authorship position
    authors = pub.get('author', [])
    author_string = '; '.join(authors) if authors else 'Unknown'
    
    # Determine authorship position for James Beattie
    authorship_position = "other"
    beattie_position = None
    
    for i, author in enumerate(authors):
        if 'Beattie, James' in author or 'Beattie, J.' in author:
            beattie_position = i + 1
            if i == 0:
                authorship_position = "first"
            elif i == 1:
                authorship_position = "second"
            else:
                authorship_position = "other"
            break
    
    # Highlight James Beattie
    author_string_highlighted = author_string.replace(
        'Beattie, James', '<strong>Beattie, James</strong>'
    ).replace(
        'Beattie, J.', '<strong>Beattie, J.</strong>'
    )
    
    # Get DOI URL
    doi = pub.get('doi', [])
    doi_url = f"https://doi.org/{doi[0]}" if doi else None
    
    # Get ADS URL
    bibcode = pub.get('bibcode', '')
    ads_url = f"https://ui.adsabs.harvard.edu/abs/{bibcode}/abstract" if bibcode else None
    
    # Check if refereed
    properties = pub.get('property', [])
    is_refereed = 'REFEREED' in properties
    
    processed = {
        'title': pub.get('title', ['Untitled'])[0] if pub.get('title') else 'Untitled',
        'authors': author_string,
        'authors_highlighted': author_string_highlighted,
        'authorship_position': authorship_position,
        'beattie_position': beattie_position,
        'journal': pub.get('pub', 'Unknown Journal'),
        'year': year,
        'pubdate': pubdate,
        'abstract': pub.get('abstract', ''),
        'bibcode': bibcode,
        'identifiers': pub.get('identifier', []),
        'ads_url': ads_url,
        'doi_url': doi_url,
        'citation_count': pub.get('citation_count', 0),
        'read_count': pub.get('read_count', 0),
        'is_refereed': is_refereed,
        'arxiv_class': pub.get('arxiv_class', [])
    }
    
    return processed

def get_manual_publications():
    """Return a list of manually specified publications (bibcodes) that should be included."""
    
    manual_bibcodes = [
        # Add bibcodes here for papers not yet linked to ORCID in ADS
        "2025arXiv250415538B",  # Scale-dependent alignment in compressible MHD turbulence
        "2025arXiv250320013G",  # Second paper to add
        "2025arXiv250603768S",  # Cosmic ray and plasma coupling for isothermal supersonic turbulence
        "2025arXiv250109855B",  # Fourth paper to add
    ]
    
    return manual_bibcodes

def fetch_manual_publications(token, bibcodes):
    """Fetch specific publications by bibcode."""
    
    if not bibcodes:
        return []
    
    base_url = "https://api.adsabs.harvard.edu/v1/search/query"
    
    # Create query for specific bibcodes
    bibcode_query = ' OR '.join([f'bibcode:{bc}' for bc in bibcodes])
    
    params = {
        'q': bibcode_query,
        'fl': 'bibcode,identifier,title,author,first_author,pubdate,pub,abstract,doi,arxiv_class,citation_count,read_count,property,metrics',
        'sort': 'date desc',
        'rows': len(bibcodes)
    }
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(base_url, params=params, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        return data.get('response', {}).get('docs', [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching manual publications: {e}")
        return []

def main():
    """Main function to fetch and save publications."""
    
    # Get environment variables
    token = os.getenv('ADS_TOKEN')
    orcid = os.getenv('ORCID')
    
    if not token:
        print("Error: ADS_TOKEN environment variable not set")
        return
    
    if not orcid:
        print("Error: ORCID environment variable not set")
        return
    
    print(f"Fetching publications for ORCID: {orcid}")
    
    # Fetch ORCID-linked publications
    orcid_publications = fetch_ads_publications(token, orcid)
    print(f"Found {len(orcid_publications)} ORCID-linked publications")
    
    # Fetch manual publications
    manual_bibcodes = get_manual_publications()
    manual_publications = []
    if manual_bibcodes:
        manual_publications = fetch_manual_publications(token, manual_bibcodes)
        print(f"Found {len(manual_publications)} manual publications")
    
    # Combine and deduplicate
    all_publications = orcid_publications + manual_publications
    seen_bibcodes = set()
    unique_publications = []
    
    for pub in all_publications:
        bibcode = pub.get('bibcode', '')
        if bibcode and bibcode not in seen_bibcodes:
            seen_bibcodes.add(bibcode)
            unique_publications.append(pub)
    
    if not unique_publications:
        print("No publications found or error occurred")
        return
    
    print(f"Total unique publications: {len(unique_publications)}")
    
    # Process publications
    processed_pubs = [process_publication(pub) for pub in unique_publications]
    
    # Create output data
    output_data = {
        'last_updated': datetime.now(timezone.utc).isoformat(),
        'total_publications': len(processed_pubs),
        'orcid': orcid,
        'publications': processed_pubs
    }
    
    # Ensure data directory exists
    os.makedirs('data', exist_ok=True)
    
    # Save to Hugo data file
    with open('data/publications.json', 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"Publications saved to data/publications.json")
    print(f"Last updated: {output_data['last_updated']}")

if __name__ == '__main__':
    main()
