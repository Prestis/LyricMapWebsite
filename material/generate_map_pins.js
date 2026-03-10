const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const inputFile = path.join(__dirname, 'rappers_locations.json');
const outputFile = path.join(__dirname, '../src/app/data/rappers_locations_mapped.json');
const API_URL = 'http://localhost:8000/locations';

// Mapping of rappers to their primary city/region of origin to provide context
const artistOrigins = {
    "Light": "Thessaloniki",
    "Snik": "Athens",
    "Trannos": "Athens",
    "Toquel": "Heraklion",
    "Lex-grc": "Thessaloniki",
    "Rack": "Athens",
    "Fy": "Thessaloniki",
    "Sidarta": "Athens",
    "Saske": "Athens",
    "Ethismos": "Athens",
    "Fly-lo": "Athens",
    "Hawk-grc": "Thessaloniki",
    "Ricta": "Thessaloniki",
    "Vlospa": "Thessaloniki",
    "Ivan-greko": "Athens",
    "Bossikan": "Thessaloniki"
};

// Function to fetch locations from the REST API
function fetchLocations() {
    return new Promise((resolve, reject) => {
        console.log(`Fetching updated locations from ${API_URL}...`);
        http.get(API_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log('Successfully fetched locations from API.');
                    resolve(result);
                } catch (e) {
                    reject(new Error('Failed to parse API response'));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Helper function to fetch data from OpenStreetMap Nominatim API
function geocode(locationStr, artistName = null) {
    return new Promise((resolve, reject) => {
        // Special manual overrides for tricky lyric names
        const overrides = {
            "narnia": null,
            "king kong": null,
            "άδη": null,
            "παράδεισο": null,
            "benzo": null,
            "benz de castro": null,
            "trannoιό": { lat: 38.9067, lon: 1.4206 }, // assuming ibiza based on lyrics
            "κοκαΐνα": null,
            "κοκαΐνα κολομβία": { lat: 4.5709, lon: -74.2973 },
            "ελλάδα": { lat: 39.0742, lon: 21.8243 },
            "αθήνα": { lat: 37.9838, lon: 23.7275 },
            "σαλόνικα": { lat: 40.6401, lon: 22.9444 },
            "σαλονίκη": { lat: 40.6401, lon: 22.9444 },
            "μύκονο": { lat: 37.4467, lon: 25.3289 },
            "ήλύσια": { lat: 37.9768, lon: 23.7554 }, // Ilisia
            "εγνατία": { lat: 40.6338, lon: 22.9388 },
            "ροτόντα": { lat: 40.6332, lon: 22.9529 },
            "panadol": null,
            "depon": null,
            "σκλαβενίτη": null,
            "κωλοδάχτυ": null,
            "κωλοδάχτυλα": null,
            "aρχαία aγο": { lat: 37.9750, lon: 23.7224 },
            "ντου": null,
            "ορφέ": null,
            "τάνια": null,
            "μητροπάνος": null,
            "μασωνεία": null,
            "ειρηνικό": { lat: 0, lon: -160 } // Pacific Ocean
        };

        const normalizedLoc = locationStr.toLowerCase();
        if (overrides[normalizedLoc] !== undefined) {
            return resolve(overrides[normalizedLoc]);
        }

        // Build the query with context if available
        let queryStr = locationStr;
        const origin = artistName ? artistOrigins[artistName] : null;

        // If the location is short or likely ambiguous, add context
        if (origin && (locationStr.length < 10 || !locationStr.includes(' '))) {
            queryStr = `${locationStr}, ${origin}, Greece`;
        } else if (!locationStr.toLowerCase().includes('greece') && !locationStr.toLowerCase().includes('ελλάδα')) {
            // General bias towards Greece for these artists
            queryStr = `${locationStr}, Greece`;
        }

        const query = encodeURIComponent(queryStr);
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path: `/search?q=${query}&format=json&limit=1&countrycodes=gr`,
            method: 'GET',
            headers: {
                'User-Agent': 'LyricMapApp/1.0 (Angular Developer)'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result && result.length > 0) {
                        resolve({
                            lat: parseFloat(result[0].lat),
                            lon: parseFloat(result[0].lon)
                        });
                    } else {
                        // If biased search fails, try a broader search as a fallback
                        if (queryStr !== locationStr) {
                           return geocodeBroad(locationStr).then(resolve);
                        }
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            resolve(null);
        });

        req.end();
    });
}

// Fallback broader geocoding without strict context bias
function geocodeBroad(locationStr) {
    return new Promise((resolve) => {
        const query = encodeURIComponent(locationStr);
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path: `/search?q=${query}&format=json&limit=1`,
            method: 'GET',
            headers: {
                'User-Agent': 'LyricMapApp/1.0 (Angular Developer)'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result && result.length > 0) {
                        resolve({
                            lat: parseFloat(result[0].lat),
                            lon: parseFloat(result[0].lon)
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            resolve(null);
        });

        req.end();
    });
}

// Pause function to respect API limits (1 request per second for Nominatim)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    let data;
    try {
        data = await fetchLocations();
    } catch (err) {
        console.warn(`Warning: Could not fetch from API (${err.message}). Falling back to local file...`);
        try {
            const rawData = fs.readFileSync(inputFile, 'utf-8');
            data = JSON.parse(rawData);
        } catch (fileErr) {
            console.error('Error: Could not read local fallback file.');
            process.exit(1);
        }
    }

    const mappedData = [];
    const locationCache = {};

    let totalEntries = 0;
    for (const artist in data) {
        totalEntries += data[artist].length;
    }

    console.log(`Processing ${totalEntries} entries...`);

    let processed = 0;
    for (const artist in data) {
        for (const item of data[artist]) {
            processed++;
            
            // Handle the new API format: {location: string, song: string}
            // Fallback for old format which was just a string
            const loc = typeof item === 'string' ? item : item.location;
            const song = typeof item === 'string' ? 'Unknown' : item.song;
            
            // Generate a unique key for cache based on artist AND location
            // because same location names can mean different things for different artists
            const cacheKey = `${artist}:${loc}`;
            
            if (locationCache[cacheKey]) {
                const coords = locationCache[cacheKey];
                addMappedEntry(mappedData, artist, loc, song, coords);
                continue;
            }

            console.log(`[${processed}/${totalEntries}] Geocoding: ${loc} for ${artist} ...`);
            
            const coords = await geocode(loc, artist);
            locationCache[cacheKey] = coords;
            
            if (coords) {
                addMappedEntry(mappedData, artist, loc, song, coords);
            }

            // Wait 1.5 seconds between requests
            await delay(1500);
        }
    }

    fs.writeFileSync(outputFile, JSON.stringify(mappedData, null, 2));
    console.log(`\nSuccessfully created ${mappedData.length} valid map pins!`);
    console.log(`Saved coordinates to: ${outputFile}`);
}

function addMappedEntry(mappedData, artist, loc, song, coords) {
    if (coords) {
        // Add a very slight random offset to prevent exact overlapping pins on the map
        const offsetLat = (Math.random() - 0.5) * 0.002;
        const offsetLon = (Math.random() - 0.5) * 0.002;

        mappedData.push({
            artist: artist,
            location: loc,
            song: song,
            lat: coords.lat + offsetLat,
            lng: coords.lon + offsetLon
        });
    }
}

main().catch(console.error);
