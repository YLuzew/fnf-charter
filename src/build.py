import io, re, sys
files = ['_js1.js','_js2.js','_js3.js','_js4.js','_js5.js']
js = '\n'.join(open(f, encoding='utf-8').read() for f in files)
html = open('index.html', encoding='utf-8').read()
marker = '<script>\n</script>'
if marker not in html:
    sys.exit('marker not found')
out = html.replace(marker, '<script>\n' + js + '\n</script>')
open('敲谱机.html','w',encoding='utf-8').write(out)
print('built 敲谱机.html', len(out.encode()), 'B, js lines', js.count('\n')+1)
