/**
 * ═══════════════════════════════════════════════════════════
 * WebDAV Middleware
 * Provides shared WebDAV functionality for Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const xml2js = require('xml2js');
const crypto = require('crypto');

/**
 * WebDAV HTTP Methods
 */
const WEBDAV_METHODS = [
  'OPTIONS',
  'GET',
  'HEAD',
  'PUT',
  'DELETE',
  'PROPFIND',
  'PROPPATCH',
  'MKCOL',
  'COPY',
  'MOVE',
  'LOCK',
  'UNLOCK'
];

/**
 * Parse raw XML body for WebDAV requests
 */
function parseXmlBody(req, res, next) {
  if (req.method === 'PROPFIND' || req.method === 'PROPPATCH' ||
      req.method === 'LOCK' || req.method === 'REPORT') {
    let data = '';
    req.setEncoding('utf8');

    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => {
      req.rawBody = data;

      // Parse XML if present
      if (data && data.trim().startsWith('<?xml')) {
        const parser = new xml2js.Parser({ explicitArray: false, xmlns: true });
        parser.parseString(data, (err, result) => {
          if (!err) {
            req.xmlBody = result;
          }
        });
      }

      next();
    });
  } else {
    next();
  }
}

/**
 * OPTIONS handler - Return DAV capabilities
 */
function optionsHandler(capabilities = ['1', '2']) {
  return (req, res) => {
    res.set({
      'DAV': capabilities.join(', '),
      'Allow': WEBDAV_METHODS.join(', '),
      'MS-Author-Via': 'DAV',
      'Accept-Ranges': 'bytes'
    });
    res.status(200).end();
  };
}

/**
 * Generate ETag for a resource
 */
function generateETag(resource) {
  const data = JSON.stringify({
    id: resource.id,
    updatedAt: resource.updatedAt || resource.updated_at,
    size: resource.size || 0
  });
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Generate XML multistatus response
 */
function generateMultistatusXml(responses) {
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ' }
  });

  const multistatusObj = {
    'd:multistatus': {
      $: {
        'xmlns:d': 'DAV:'
      },
      'd:response': responses
    }
  };

  return builder.buildObject(multistatusObj);
}

/**
 * Generate PROPFIND response for a collection
 */
function generateCollectionResponse(collection, baseUrl, depth = '1') {
  const href = `${baseUrl}/${collection.id || collection.path || ''}/`;
  const etag = generateETag(collection);

  const response = {
    'd:href': href,
    'd:propstat': {
      'd:prop': {
        'd:displayname': collection.name || collection.title,
        'd:resourcetype': { 'd:collection': '' },
        'd:creationdate': collection.createdAt || collection.created_at,
        'd:getlastmodified': collection.updatedAt || collection.updated_at,
        'd:getetag': `"${etag}"`,
        'd:supportedlock': {
          'd:lockentry': [
            {
              'd:lockscope': { 'd:exclusive': '' },
              'd:locktype': { 'd:write': '' }
            },
            {
              'd:lockscope': { 'd:shared': '' },
              'd:locktype': { 'd:write': '' }
            }
          ]
        }
      },
      'd:status': 'HTTP/1.1 200 OK'
    }
  };

  return response;
}

/**
 * Generate PROPFIND response for a resource (file)
 */
function generateResourceResponse(resource, baseUrl) {
  const href = `${baseUrl}/${resource.id || resource.name}`;
  const etag = generateETag(resource);

  const response = {
    'd:href': href,
    'd:propstat': {
      'd:prop': {
        'd:displayname': resource.name || resource.filename,
        'd:getcontentlength': resource.size || 0,
        'd:getcontenttype': resource.mimetype || resource.contentType || 'application/octet-stream',
        'd:creationdate': resource.createdAt || resource.created_at,
        'd:getlastmodified': resource.updatedAt || resource.updated_at,
        'd:getetag': `"${etag}"`,
        'd:supportedlock': {
          'd:lockentry': [
            {
              'd:lockscope': { 'd:exclusive': '' },
              'd:locktype': { 'd:write': '' }
            }
          ]
        }
      },
      'd:status': 'HTTP/1.1 200 OK'
    }
  };

  return response;
}

/**
 * Parse PROPFIND request depth
 */
function parseDepth(req) {
  const depth = req.headers.depth;

  if (depth === '0') return 0;
  if (depth === '1') return 1;
  if (depth === 'infinity') return Infinity;

  return 1; // Default
}

/**
 * Parse Destination header
 */
function parseDestination(req) {
  const dest = req.headers.destination;
  if (!dest) return null;

  try {
    const url = new URL(dest);
    return url.pathname;
  } catch (e) {
    return dest;
  }
}

/**
 * Parse Overwrite header
 */
function parseOverwrite(req) {
  const overwrite = req.headers.overwrite;
  return overwrite !== 'F';
}

/**
 * Generate lock response
 */
function generateLockResponse(lock, baseUrl) {
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ' }
  });

  const propObj = {
    'd:prop': {
      $: {
        'xmlns:d': 'DAV:'
      },
      'd:lockdiscovery': {
        'd:activelock': {
          'd:locktype': { 'd:write': '' },
          'd:lockscope': { 'd:exclusive': '' },
          'd:depth': lock.depth || 'infinity',
          'd:owner': lock.owner || '',
          'd:timeout': `Second-${lock.timeout || 3600}`,
          'd:locktoken': {
            'd:href': `opaquelocktoken:${lock.token}`
          },
          'd:lockroot': {
            'd:href': baseUrl
          }
        }
      }
    }
  };

  return builder.buildObject(propObj);
}

/**
 * Parse LOCK request
 */
function parseLockRequest(xmlBody) {
  if (!xmlBody) {
    return {
      scope: 'exclusive',
      type: 'write',
      owner: null
    };
  }

  try {
    const lockinfo = xmlBody['d:lockinfo'] || xmlBody.lockinfo;

    const scope = lockinfo['d:lockscope'] || lockinfo.lockscope;
    const type = lockinfo['d:locktype'] || lockinfo.locktype;
    const owner = lockinfo['d:owner'] || lockinfo.owner;

    return {
      scope: scope['d:exclusive'] ? 'exclusive' : 'shared',
      type: type['d:write'] ? 'write' : 'read',
      owner: typeof owner === 'string' ? owner : owner?.['d:href'] || null
    };
  } catch (e) {
    return {
      scope: 'exclusive',
      type: 'write',
      owner: null
    };
  }
}

/**
 * Generate PROPPATCH response
 */
function generateProppatchResponse(href, updatedProps, failedProps = []) {
  const responses = [];

  if (updatedProps.length > 0) {
    const propObj = {};
    updatedProps.forEach(prop => {
      propObj[`d:${prop.name}`] = prop.value;
    });

    responses.push({
      'd:propstat': {
        'd:prop': propObj,
        'd:status': 'HTTP/1.1 200 OK'
      }
    });
  }

  if (failedProps.length > 0) {
    const propObj = {};
    failedProps.forEach(prop => {
      propObj[`d:${prop.name}`] = '';
    });

    responses.push({
      'd:propstat': {
        'd:prop': propObj,
        'd:status': 'HTTP/1.1 403 Forbidden'
      }
    });
  }

  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ' }
  });

  const multistatusObj = {
    'd:multistatus': {
      $: {
        'xmlns:d': 'DAV:'
      },
      'd:response': {
        'd:href': href,
        'd:propstat': responses
      }
    }
  };

  return builder.buildObject(multistatusObj);
}

/**
 * Error response generator
 */
function sendWebDAVError(res, status, message) {
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ' }
  });

  const errorObj = {
    'd:error': {
      $: {
        'xmlns:d': 'DAV:'
      },
      'd:message': message
    }
  };

  res.status(status);
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(builder.buildObject(errorObj));
}

module.exports = {
  WEBDAV_METHODS,
  parseXmlBody,
  optionsHandler,
  generateETag,
  generateMultistatusXml,
  generateCollectionResponse,
  generateResourceResponse,
  parseDepth,
  parseDestination,
  parseOverwrite,
  generateLockResponse,
  parseLockRequest,
  generateProppatchResponse,
  sendWebDAVError
};
