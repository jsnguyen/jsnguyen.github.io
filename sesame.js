// Reset button state on page load
window.addEventListener('load', function() {
    const plotButton = document.querySelector("#plot_button");
    if (plotButton) {
        plotButton.disabled = true;
    }
});

// SESAME astronomical name resolver
async function resolveTarget() {
    const targetNameInput = document.querySelector("#target_name_input");
    const raInput = document.querySelector("#ra_input");
    const decInput = document.querySelector("#dec_input");
    const resolveButton = document.querySelector("#resolve_button");
    
    if (!targetNameInput.value.trim()) {
        alert("Please enter a target name");
        return;
    }
    
    // Show loading state
    resolveButton.disabled = true;
    resolveButton.textContent = "Resolving...";
    
    try {
        // Use CDS SESAME service with XML output
        await resolveTargetSESAME(targetNameInput.value, raInput, decInput);
        
    } catch (error) {
        console.error('Error resolving target:', error);
        alert(`Could not resolve target: ${targetNameInput.value}. Please enter coordinates manually.`);
    } finally {
        resolveButton.disabled = false;
        resolveButton.textContent = "Resolve";
    }
}

// SESAME resolver using proper CDS SESAME API
async function resolveTargetSESAME(targetName, raInput, decInput) {
    try {
        // Use HTTPS endpoint with XML output (-ox option) and all databases (~A)
        const url = `https://cds.unistra.fr/cgi-bin/nph-sesame/-ox/~A?${encodeURIComponent(targetName)}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`SESAME service returned status: ${response.status}`);
        }
        
        const xmlText = await response.text();
        
        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for XML parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Failed to parse SESAME XML response');
        }
        
        // Look for resolver results - try each resolver (Simbad, NED, VizieR)
        const resolvers = xmlDoc.querySelectorAll('Resolver');
        let ra_deg = null;
        let dec_deg = null;
        
        for (const resolver of resolvers) {
            const jradegElement = resolver.querySelector('jradeg');
            const jdedegElement = resolver.querySelector('jdedeg');
            
            if (jradegElement && jdedegElement) {
                ra_deg = parseFloat(jradegElement.textContent);
                dec_deg = parseFloat(jdedegElement.textContent);
                
                // Log which resolver provided the result
                const resolverName = resolver.getAttribute('name') || 'Unknown';
                console.log(`Coordinates found from ${resolverName}`);
                break;
            }
        }
        
        if (ra_deg !== null && dec_deg !== null && !isNaN(ra_deg) && !isNaN(dec_deg)) {
            // Convert decimal degrees to HMS DMS format
            const ra_hms = degreesToHMS(ra_deg);
            const dec_dms = degreesToDMS(dec_deg);
            
            raInput.value = ra_hms;
            decInput.value = dec_dms;
            console.log(`Resolved ${targetName}: RA=${ra_hms}, Dec=${dec_dms}`);
        } else {
            // Try fallback with text output format
            await resolveTargetSESAMEText(targetName, raInput, decInput);
        }
        
    } catch (error) {
        console.error('SESAME XML resolver failed:', error);
        // Try fallback with text output format
        await resolveTargetSESAMEText(targetName, raInput, decInput);
    }
}

// Fallback SESAME resolver using text output format
async function resolveTargetSESAMEText(targetName, raInput, decInput) {
    try {
        // Use text output format (no -ox option) with all databases (~A)
        const url = `https://cds.unistra.fr/cgi-bin/nph-sesame/~A?${encodeURIComponent(targetName)}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`SESAME text service returned status: ${response.status}`);
        }
        
        const text = await response.text();
        
        // Parse text format response
        const lines = text.split('\n');
        let ra_deg = null;
        let dec_deg = null;
        
        for (const line of lines) {
            // Look for coordinate lines in format: %J ra_deg dec_deg (precision) = hh mm ss.ss  +dd mm ss.s
            if (line.startsWith('%J ')) {
                const coords = line.substring(3).trim().split(/\s+/);
                if (coords.length >= 2) {
                    ra_deg = parseFloat(coords[0]);
                    dec_deg = parseFloat(coords[1]);
                    
                    if (!isNaN(ra_deg) && !isNaN(dec_deg)) {
                        break;
                    }
                }
            }
        }
        
        if (ra_deg !== null && dec_deg !== null && !isNaN(ra_deg) && !isNaN(dec_deg)) {
            // Convert decimal degrees to HMS DMS format
            const ra_hms = degreesToHMS(ra_deg);
            const dec_dms = degreesToDMS(dec_deg);
            
            raInput.value = ra_hms;
            decInput.value = dec_dms;
            console.log(`Resolved ${targetName}: RA=${ra_hms}, Dec=${dec_dms}`);
        } else {
            throw new Error('No valid coordinates found in SESAME response');
        }
        
    } catch (error) {
        console.error('SESAME text resolver failed:', error);
        throw new Error(`Could not resolve target: ${targetName}`);
    }
}

// Convert decimal degrees to HMS format
function degreesToHMS(degrees) {
    const hours = degrees / 15;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const s = ((hours - h) * 60 - m) * 60;
    return `${h.toString().padStart(2, '0')} ${m.toString().padStart(2, '0')} ${s.toFixed(1).padStart(4, '0')}`;
}

// Convert decimal degrees to DMS format
function degreesToDMS(degrees) {
    const sign = degrees >= 0 ? '+' : '-';
    const absDegrees = Math.abs(degrees);
    const d = Math.floor(absDegrees);
    const m = Math.floor((absDegrees - d) * 60);
    const s = ((absDegrees - d) * 60 - m) * 60;
    return `${sign}${d.toString().padStart(2, '0')} ${m.toString().padStart(2, '0')} ${s.toFixed(1).padStart(4, '0')}`;
}

// Allow Enter key to trigger resolve
document.addEventListener('DOMContentLoaded', function() {
    const targetNameInput = document.querySelector("#target_name_input");
    if (targetNameInput) {
        targetNameInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                resolveTarget();
            }
        });
    }
});