#!/usr/bin/env node

"use strict";

// ---------------------------------------------------------------------------
// Transform the enriched data file to several XML files.
// ---------------------------------------------------------------------------

const fs = require('fs');

// the input file with the entities
const JSONDIR = './json/';
const TTLDIR  = './ttl/';
const XMLDIR  = './xml/';
const INFILE  = './data/enriched.json';
const DATA    = JSON.parse(fs.readFileSync(INFILE, 'utf-8'));

// turn a string into yellow (for the interactive console)
function yellow(s)
{
    return '\u001b[33m' + s + '\u001b[39m'
}

function string(file, name, content)
{
    fs.writeSync(file, '   "' + name + '": "' + content.replace(/"/g, '\\"') + '"');
}

function number(file, name, content)
{
    fs.writeSync(file, '   "' + name + '": ' + content);
}

function array(file, name, content)
{
    if ( ! content.length ) {
        fs.writeSync(file, '   "' + name + '": []');
    }
    else {
        fs.writeSync(file, '   "' + name + '": [\n');
        content.forEach((item, i) => {
            fs.writeSync(file, '      "' + item.replace(/"/g, '\\"') + '"');
            endProp(file, i, content.length);
        });
        fs.writeSync(file, '   ]');
    }
}

function endProp(file, i, len)
{
    if ( i + 1 < len ) {
        fs.writeSync(file, ',');
    }
    fs.writeSync(file, '\n');
}

function triple(file, rsrc, prop, content, type)
{
    // different outputs for different cases
    const ref = (pred, type, idx) => {
	fs.writeSync(file, `${rsrc}  sw:${pred}  sw:${type}-${content.slice(idx, -1)} .\n`);
    };
    const typed = (type) => {
	fs.writeSync(file, `${rsrc}  sw:${prop}  "${content}"^^xs:${type} .\n`);
    };
    const number = () => {
	fs.writeSync(file, `${rsrc}  sw:${prop}  ${content} .\n`);
    };
    const str = () => {
        const pred = prop === 'title' || prop === 'name'
            ? 'rdfs:label'
            : 'sw:' + prop;
        if ( /[\n\r]/.test(content) ) {
	    const c = content.replace(/"""/g, '\\u0022\\u0022\\u0022');
	    fs.writeSync(file, `${rsrc}  ${pred}  """${c}""" .\n`);
        }
        else {
	    const c = content.replace(/"/g, '\\u0022');
	    fs.writeSync(file, `${rsrc}  ${pred}  "${c}" .\n`);
        }
    };

    // numeric properties
    const numbers = [
        'average_height',
        'average_lifespan',        // can be "indefinite"
        'cargo_capacity',          // can be "none"
        'cost_in_credits',
        'crew',
        'diameter',
        'episode_id',
        'hyperdrive_rating',       // decimal
        'length',                  // decimal, with "," for thousands
        'max_atmosphering_speed',  // there is one "1000km"
        'orbital_period',
        'passengers',
        'rotation_period'
    ];

    // output the triple
    if ( prop === 'characters' ) {
        ref('character', 'people', 27);
    }
    else if ( prop === 'films' ) {
        ref('film', 'film', 26);
    }
    else if ( prop === 'homeworld' ) {
        ref('homeworld', 'planet', 28);
    }
    else if ( prop === 'people' ) {
        ref('people', 'people', 27);
    }
    else if ( prop === 'pilots' ) {
        ref('pilot', 'people', 27);
    }
    else if ( prop === 'planets' ) {
        ref('planet', 'planet', 28);
    }
    else if ( prop === 'residents' ) {
        ref('resident', 'people', 27);
    }
    else if ( prop === 'species' ) {
        ref('species', 'species', 28);
    }
    else if ( prop === 'starships' ) {
        ref('starship', 'starship', 30);
    }
    else if ( prop === 'vehicles' ) {
        ref('vehicle', 'vehicle', 29);
    }
    else if ( prop === 'release_date' ) {
	typed('date');
    }
    else if ( ['created', 'edited'].includes(prop) ) {
	typed('dateTime');
    }
    else if ( type === 'number' ) {
        number();
    }
    else if ( numbers.includes(prop) ) {
        content = content.replace(',', '');
        if ( isNaN(content) ) {
            str();
        }
        else {
            number();
        }
    }
    else if ( prop !== 'url' && content.startsWith('http://swapi.co/api/') ) {
	throw new Error('Should not this be a resource link? - ' + prop);
    }
    else {
        str();
    }
}

function elem(file, name, content)
{
    if ( typeof content === 'string' ) {
        content = content.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }
    fs.writeSync(file, '   <' + name + '>' + content + '</' + name + '>\n');
}

function writeEntity(entity, dir, root)
{
    const num  = entity.url.split('/').slice(-2)[0];
    const rsrc = 'sw:' + root + '-' + num;
    const path = dir + '/' + num;
    console.warn(path);
    const json  = fs.openSync(JSONDIR + path + '.json', 'w');
    const ttl   = fs.openSync(TTLDIR  + path + '.ttl', 'w');
    const xml   = fs.openSync(XMLDIR  + path + '.xml',  'w');
    fs.writeSync(json, '{ "' + root + '": {\n');
    fs.writeSync(ttl,  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n');
    fs.writeSync(ttl,  '@prefix sw:   <http://h2o.consulting/ns/star-wars#> .\n');
    fs.writeSync(ttl,  '@prefix xs:   <http://www.w3.org/2001/XMLSchema#> .\n\n');
    fs.writeSync(ttl,  rsrc + '  a  sw:' + clazz + ' .\n');
    fs.writeSync(xml,  '<' + root + ' xmlns="http://h2o.consulting/ns/star-wars">\n');
    const clazz = root[0].toUpperCase() + root.slice(1);
    const props = Object.keys(entity);
    props.forEach((prop, i) => {
        const val  = entity[prop];
        const type = typeof val;
        if ( val === 'unknown' || val === 'n/a' || val === null ) {
        }
        else if ( type === 'string' ) {
            string(json, prop, val);
            endProp(json, i, props.length);
            triple(ttl, rsrc, prop, val, type);
            elem(xml, prop, val);
        }
        else if ( type === 'number' ) {
            number(json, prop, val);
            endProp(json, i, props.length);
            triple(ttl, rsrc, prop, val, type);
            elem(xml, prop, val);
        }
        else if ( Array.isArray(val) ) {
            array(json, prop, val);
            endProp(json, i, props.length);
            val.forEach(v => triple(ttl, rsrc, prop, v, type));
            val.forEach(v => elem(xml, prop, v));
        }
        else {
            const str = JSON.stringify(entity);
            throw new Error(`Unknown type ${type} for ${prop} in ${str}`);
        }
    });
    fs.writeSync(json, '}}\n');
    fs.writeSync(xml,  '</' + root + '>\n');
}

const sections = [
    [ 'people',    'people'   ],
    [ 'planets',   'planet'   ],
    [ 'films',     'film'     ],
    [ 'species',   'species'  ],
    [ 'vehicles',  'vehicle'  ],
    [ 'starships', 'starship' ]
];

sections.forEach(section => {
    const dir  = section[0];
    const root = section[1];
    console.warn('** ' + yellow(dir));
    DATA[dir].forEach(entity => writeEntity(entity, dir, root));
    console.warn();
});
