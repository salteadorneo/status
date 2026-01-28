/**
 * Simple YAML parser - Zero dependencies
 * Supports basic YAML features needed for config files
 */

export function parseYAML(yamlString) {
  const lines = yamlString.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  const result = {};
  let currentKey = null;
  let currentArray = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineIndent = line.search(/\S/);

    if (trimmed.startsWith('- ')) {
      const item = trimmed.substring(2).trim();
      
      if (item.includes(':')) {
        const obj = {};
        const colonIndex = item.indexOf(':');
        const key = item.substring(0, colonIndex).trim();
        const value = item.substring(colonIndex + 1).trim();
        obj[key] = parseValue(value);
        
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();
          const nextIndent = nextLine.search(/\S/);
          
          if (nextIndent <= lineIndent) break;
          if (nextTrimmed.startsWith('- ')) break;
          
          if (nextTrimmed.includes(':')) {
            const colonIndex = nextTrimmed.indexOf(':');
            const k = nextTrimmed.substring(0, colonIndex).trim();
            const v = nextTrimmed.substring(colonIndex + 1).trim();
            obj[k] = parseValue(v);
            i = j;
          }
          j++;
        }
        
        if (currentArray) {
          currentArray.push(obj);
        }
      } else {
        if (currentArray) {
          currentArray.push(parseValue(item));
        }
      }
      continue;
    }

    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (value === '') {
        currentKey = key;
        currentArray = [];
        result[key] = currentArray;
      } else {
        result[key] = parseValue(value);
        currentKey = null;
        currentArray = null;
      }
    }
  }

  return result;
}

function parseValue(value) {
  if (!value) return '';
  
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  
  if (!isNaN(value) && value !== '') {
    return Number(value);
  }
  
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  
  return value;
}
