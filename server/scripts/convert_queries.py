#!/usr/bin/env python3
"""
Script para convertir queries legacy a PostgreSQL en index.js
- Reemplaza placeholders ? por $1, $2, $3, etc.
- Actualiza destructuring [rows] por result.rows
- Actualiza [result] por result (para INSERT/UPDATE)
"""

import re
import sys

def convert_legacy_to_postgres_query(line):
    """Convierte placeholders y destructuring a PostgreSQL"""
    
    # Caso 1: const [rows] = await pool.query(...) → const result = await pool.query(...)
    # Luego acceder con result.rows
    match_select = re.match(r'^(\s*)const \[rows\] = await pool\.query\((.*)\);(.*)$', line)
    if match_select:
        indent = match_select.group(1)
        query_part = match_select.group(2)
        comment = match_select.group(3)
        
        # Contar cuántos ? hay y reemplazarlos por $1, $2, etc.
        query_with_placeholders = convert_placeholders(query_part)
        
        return f"{indent}const result = await pool.query({query_with_placeholders});{comment}"
    
    # Caso 2: const [result] = await pool.query(...) → const result = await pool.query(...)
    match_insert = re.match(r'^(\s*)const \[result\] = await pool\.query\((.*)\);(.*)$', line)
    if match_insert:
        indent = match_insert.group(1)
        query_part = match_insert.group(2)
        comment = match_insert.group(3)
        
        query_with_placeholders = convert_placeholders(query_part)
        
        return f"{indent}const result = await pool.query({query_with_placeholders});{comment}"
    
    # Caso 3: await pool.query(...) sin const → solo convertir placeholders
    match_plain = re.match(r'^(\s*)await pool\.query\((.*)\);(.*)$', line)
    if match_plain:
        indent = match_plain.group(1)
        query_part = match_plain.group(2)
        comment = match_match3.group(3)
        
        query_with_placeholders = convert_placeholders(query_part)
        
        return f"{indent}await pool.query({query_with_placeholders});{comment}"
    
    # Caso 4: rows[0] → result.rows[0]
    if 'rows[0]' in line and 'result.rows' not in line:
        line = line.replace('rows[0]', 'result.rows[0]')
    
    # Caso 5: rows.length → result.rows.length
    if 'rows.length' in line and 'result.rows' not in line:
        line = line.replace('rows.length', 'result.rows.length')
    
    # Caso 6: result.insertId → result.rows[0].id (después de usar RETURNING id)
    if 'result.insertId' in line:
        line = line.replace('result.insertId', 'result.rows[0].id')
    
    return line

def convert_placeholders(query_str):
    """Reemplaza ? por $1, $2, $3, etc. en un query string"""
    counter = 1
    result = []
    i = 0
    in_string = False
    string_char = None
    
    while i < len(query_str):
        char = query_str[i]
        
        # Toggle string mode
        if char in ["'", '"', '`'] and (i == 0 or query_str[i-1] != '\\\\'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None
        
        # Replace ? with $N only outside strings
        if char == '?' and not in_string:
            result.append(f'${counter}')
            counter += 1
        else:
            result.append(char)
        
        i += 1
    
    return ''.join(result)

def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else 'index.js'
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'index_postgres.js'
    
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    converted_lines = []
    for line in lines:
        converted = convert_legacy_to_postgres_query(line.rstrip('\\n'))
        converted_lines.append(converted + '\\n')
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(converted_lines)
    
    print(f"Converted {input_file} → {output_file}")
    print(f"Total lines processed: {len(lines)}")

if __name__ == '__main__':
    main()
