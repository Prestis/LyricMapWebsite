const fs = require('fs');
const path = require('path');
const http = require('http');

const inputFile = path.join(__dirname, '../src/app/data/rappers_locations_mapped.json');
const outputFile = path.join(__dirname, '../src/app/data/rappers_locations_mapped.json');
const API_URL = 'http://localhost:8000/locations';

// Function to fetch locations from the REST API
function fetchLocations() {
    return new Promise((resolve, reject) => {
        console.log(`Fetching locations from ${API_URL}...`);
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

    let totalEntries = 0;
    for (const artist in data) {
        totalEntries += data[artist].length;
    }

    console.log(`Processing ${totalEntries} entries...`);

    for (const artist in data) {
        for (const item of data[artist]) {
            // Handle the input format: {location: string, song: string, lat: number, lng: number}
            const loc = item.location;
            const song = item.song || 'Unknown';
            const lat = item.lat;
            const lng = item.lng;

            if (lat !== undefined && lng !== undefined) {
                addMappedEntry(mappedData, artist, loc, song, { lat, lng });
            } else {
                console.warn(`Skipping ${loc} for ${artist}: Missing coordinates.`);
            }
        }
    }

    fs.writeFileSync(outputFile, JSON.stringify(mappedData, null, 2));
    console.log(`\nSuccessfully created ${mappedData.length} map pins!`);
    console.log(`Saved coordinates to: ${outputFile}`);
}

function addMappedEntry(mappedData, artist, loc, song, coords) {
    // Add a very slight random offset to prevent exact overlapping pins on the map
    const offsetLat = (Math.random() - 0.5) * 0.002;
    const offsetLon = (Math.random() - 0.5) * 0.002;

    mappedData.push({
        artist: artist,
        location: loc,
        song: song,
        lat: coords.lat + offsetLat,
        lng: coords.lng + offsetLon
    });
}

main().catch(console.error);
