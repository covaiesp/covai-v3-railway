# 🚀 COVAI V3 — Deploy en Railway

## ⚡ Pasos para desplegar

### 1. Sube el código a GitHub (YA LO HICISTE)
```bash
git push origin main
```

### 2. Ve a Railway.app

- https://railway.app
- Sign up con GitHub
- Click "New Project"

### 3. "Deploy from GitHub repo"

- Busca tu repo `covai`
- Click "Deploy"
- **Railroad compila automáticamente** (no necesita ZIP)

### 4. Configura Environment Variables en Railway

En Railroad Dashboard → tu proyecto → Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://ptmfgyflyjkqjkzwrlnx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0bWZneWZseWprcWprendybG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjYxNjEsImV4cCI6MjA5NDE0MjE2MX0.QXxEg2THvUltaWk2Y_dORK7I4J30sySBxWC2WLPrUVI
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0bWZneWZseWprcWprendybG54Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2NjE2MSwiZXhwIjoyMDk0MTQyMTYxfQ.5vZYtMKA3hQDVWxm78Nr0Yy_f51_xGB29StvnaXn-Rs
```

### 5. Deploy automático

Railroad redeploy automáticamente cada vez que hagas:
```bash
git push origin main
```

### 6. Conectar dominio www.covai.es

En Railroad:
- Settings → Domain
- "Add Custom Domain": `www.covai.es`
- Copia el CNAME que te da
- Ve a tu registrador (GoDaddy/Namecheap)
- Edita DNS de `covai.es`
- Añade el CNAME
- Listo en 15-30 minutos

---

## 🔧 Si falla el build en Railway

**Error típico:** "Module not found"

**Causa:** Imports mal configurados

**Solución:** Ya está corregido en este código. Si aún falla:

1. Ve a Railroad Logs
2. Busca la línea del error
3. Verifica que el archivo existe

---

## ✅ Checklist

- [ ] GitHub repo creado y código pusheado
- [ ] Cuenta Railroad creada
- [ ] Proyecto conectado desde GitHub
- [ ] Variables de entorno agregadas
- [ ] Deploy iniciado (debería estar en progreso)
- [ ] Esperar 2-3 minutos
- [ ] Verificar app en Railroad URL (tipo: covai-production-xxxxx.up.railway.app)
- [ ] Conectar dominio www.covai.es (15-30 min)

---

## 📞 Si necesitas ayuda

Los logs están en Railroad Dashboard → tu proyecto → Logs

Copiar el error completo y darme para debuggear.
