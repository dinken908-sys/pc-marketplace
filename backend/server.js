const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const saltRounds = 10; 
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const upload = multer({ storage: multer.memoryStorage() });

const SUPABASE_URL = 'https://kbdewsclmcswdfngomzk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZGV3c2NsbWNzd2RmbmdvbXprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjUwNTgzMCwiZXhwIjoyMDkyMDgxODMwfQ.ZCEQU4IJr3WbKda3N540c_kzqF8ozYKrZcSnUb0ynyw';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);


function convertToRUB(priceInUSD) {
    return Math.round(priceInUSD * USD_TO_RUB);
}

async function uploadToSupabase(file, productName) {
    try {
        let processedBuffer = file.buffer;
        
        try {
            processedBuffer = await sharp(file.buffer)
                .resize(400, 400, {
                    fit: 'contain',
                    background: { r: 248, g: 249, b: 250, alpha: 1 }
                })
                .jpeg({ quality: 85 })
                .toBuffer();
            
            console.log('Image processed: resized to 400x400');
        } catch (sharpError) {
            console.log('Sharp processing failed, using original image:', sharpError.message);
        }
        
        const fileExt = '.jpg';
        const uniqueName = `${Date.now()}_${productName.replace(/[^a-zA-Z0-9]/g, '_')}${fileExt}`;
        const filePath = `products/${uniqueName}`;

        console.log('Uploading to Supabase Storage:', filePath);

        const { data, error } = await supabase.storage
            .from('product-images')
            .upload(filePath, processedBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw error;
        }

        const { data: publicUrlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

        console.log('File uploaded successfully:', publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
    } catch (error) {
        console.error('Error in uploadToSupabase:', error);
        throw new Error('Failed to upload image to Supabase');
    }
}

async function isAdmin(req, res, next) {
    const userId = req.headers['user-id'];
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { data: user, error } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', parseInt(userId))
        .single();
    
    if (error || !user || !user.is_admin) {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    
    next();
}

app.get('/api/components', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('components')
            .select('*')
            .order('id');
        
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching components:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        console.log('Registration attempt:', { username, email });
        
        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        const { data: existingUsername } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('Password hashed successfully');
        
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ 
                username, 
                email, 
                password: hashedPassword,
                is_admin: false 
            }])
            .select()
            .single();
        
        if (error) {
            console.error('Insert error:', error);
            throw error;
        }
        
        console.log('User created:', newUser.id);
        
        res.json({ 
            success: true, 
            user: { 
                id: newUser.id, 
                username: newUser.username, 
                email: newUser.email,
                is_admin: false
            } 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('Login attempt:', { email });
        
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, email, is_admin, password')
            .eq('email', email)
            .maybeSingle();
        
        if (error || !user) {
            console.log('User not found:', email);
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        console.log('User found:', user.id);
        console.log('Stored password type:', typeof user.password);
        console.log('Stored password length:', user.password?.length);
        
        let isPasswordValid = false;
        let needsHashMigration = false;
        
        const isBcryptHash = user.password && user.password.startsWith('$2b$');
        
        if (isBcryptHash) {
            try {
                isPasswordValid = await bcrypt.compare(password, user.password);
                console.log('Bcrypt compare result:', isPasswordValid);
            } catch (err) {
                console.error('Bcrypt error:', err);
            }
        } else {
            isPasswordValid = (password === user.password);
            if (isPasswordValid) {
                needsHashMigration = true;
                console.log('Plain text password match, need migration');
            }
        }
        
        if (!isPasswordValid) {
            console.log('Invalid password for user:', user.id);
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        if (needsHashMigration) {
            try {
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                await supabase
                    .from('users')
                    .update({ password: hashedPassword })
                    .eq('id', user.id);
                console.log('Password migrated to hash for user:', user.id);
            } catch (migrateError) {
                console.error('Migration error:', migrateError);
            }
        }
        
        res.json({ 
            success: true, 
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                is_admin: user.is_admin 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/user/password', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const { oldPassword, newPassword } = req.body;
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: user, error } = await supabase
            .from('users')
            .select('password')
            .eq('id', parseInt(userId))
            .single();
        
        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }
        
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ password: hashedNewPassword })
            .eq('id', parseInt(userId));
        
        if (updateError) throw updateError;
        
        res.json({ success: true, message: 'Пароль успешно изменен' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user/:id/is-admin', async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', parseInt(req.params.id))
            .single();
        
        if (error) throw error;
        res.json({ is_admin: user?.is_admin || false });
    } catch (error) {
        res.json({ is_admin: false });
    }
});

app.post('/api/admin/components', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, type, price, stock, specs, category, description } = req.body;
        
        let imageUrl = null;
        
        if (req.file) {
            try {
                imageUrl = await uploadImageToSupabase(req.file.buffer, name);
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
            }
        }
        
        if (!imageUrl) {
            imageUrl = `https://placehold.co/400x400/667eea/white?text=${encodeURIComponent(name.substring(0, 20))}`;
        }

        const priceRub = parseFloat(price);
        
        const { data, error } = await supabase
            .from('components')
            .insert([{
                name,
                type,
                price: priceRub,
                stock: parseInt(stock),
                specs: specs || 'Характеристики не указаны',
                category: category || 'general',
                description: description || '',
                image: imageUrl
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        console.error('Error adding component:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/components/:id', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { price, stock, specs, category, description } = req.body;
        const componentId = parseInt(req.params.id);
        
        let updateData = { 
            stock: parseInt(stock), 
            specs: specs, 
            category: category,
            description: description
        };

        if (price) {
            updateData.price = parseFloat(price);
        }
        
        if (req.file) {
            try {
                const imageUrl = await uploadImageToSupabase(req.file.buffer, `update_${componentId}`);
                updateData.image = imageUrl;
                console.log('Image updated:', imageUrl);
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
            }
        }
        
        const { data, error } = await supabase
            .from('components')
            .update(updateData)
            .eq('id', componentId)
            .select()
            .single();
        
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        console.error('Error updating component:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/components/:id', isAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('components')
            .delete()
            .eq('id', parseInt(req.params.id));
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/builds', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('builds')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching builds:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/builds', async (req, res) => {
    try {
        const { total_price, components, name, category } = req.body;
        const userId = req.headers['user-id'];
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username')
            .eq('id', parseInt(userId))
            .single();
        
        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const priceRub = total_price;
        
        const { data, error } = await supabase
            .from('builds')
            .insert([{
                user_id: parseInt(userId),
                username: user.username,
                name: name || 'Моя сборка',
                components: components || {},
                total_price: priceRub,
                category: category || 'general',
                likes: 0,
                created_at: new Date()
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        console.error('Error saving build:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/builds/:id/like', async (req, res) => {
    try {
        const buildId = parseInt(req.params.id);
        const userId = req.headers['user-id'];
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: build, error: fetchError } = await supabase
            .from('builds')
            .select('likes, liked_by')
            .eq('id', buildId)
            .single();
        
        if (fetchError || !build) {
            return res.status(404).json({ error: 'Build not found' });
        }
        
        let likedBy = build.liked_by || [];
        let newLikes = build.likes || 0;
        let action = '';
        
        if (likedBy.includes(userId)) {
            likedBy = likedBy.filter(id => id !== userId);
            newLikes--;
            action = 'unliked';
        } else {
            likedBy.push(userId);
            newLikes++;
            action = 'liked';
        }
        
        const { data, error } = await supabase
            .from('builds')
            .update({ 
                likes: newLikes,
                liked_by: likedBy
            })
            .eq('id', buildId)
            .select()
            .single();
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            action: action,
            likes: newLikes,
            liked_by: likedBy
        });
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/user/:userId/builds', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log('Getting builds for user:', userId);
        
        const { data, error } = await supabase
            .from('builds')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching builds:', error);
            throw error;
        }
        
        console.log(`Found ${data?.length || 0} builds for user ${userId}`);
        
        const convertedData = (data || []).map(build => ({
            ...build,
            total_price: Math.round((build.total_price || 0) * 75),
            total_price_usd: build.total_price
        }));
        
        res.json(convertedData);
    } catch (error) {
        console.error('Error in get user builds:', error);
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/builds/:id', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const buildId = parseInt(req.params.id);
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', parseInt(userId))
            .single();
        
        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const isAdmin = user.is_admin;
        
        const { data: build, error: findError } = await supabase
            .from('builds')
            .select('user_id')
            .eq('id', buildId)
            .single();
        
        if (findError || !build) {
            return res.status(404).json({ error: 'Build not found' });
        }
        
        if (!isAdmin && build.user_id !== parseInt(userId)) {
            return res.status(403).json({ error: 'Forbidden: You can only delete your own builds' });
        }
        
        const { error } = await supabase
            .from('builds')
            .delete()
            .eq('id', buildId);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Build deleted successfully' });
    } catch (error) {
        console.error('Error deleting build:', error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/build-categories', async (req, res) => {
    try {
        console.log('GET /api/build-categories - запрос получен');
        const { data, error } = await supabase
            .from('build_categories')
            .select('*')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/build-categories/active', async (req, res) => {
    try {
        console.log('GET /api/build-categories/active - запрос получен');
        const { data, error } = await supabase
            .from('build_categories')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/build-templates/:categoryId', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.categoryId);
        console.log('GET /api/build-templates/', categoryId);
        const { data, error } = await supabase
            .from('build_templates')
            .select('*')
            .eq('category_id', categoryId);
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/build-categories', isAdmin, async (req, res) => {
    try {
        const { name, icon, description, sort_order, is_active } = req.body;
        const { data, error } = await supabase
            .from('build_categories')
            .insert([{
                name,
                icon: icon || '📁',
                description: description || '',
                sort_order: sort_order || 0,
                is_active: is_active !== undefined ? is_active : true
            }])
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/admin/build-categories/:id', isAdmin, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        const { name, icon, description, sort_order, is_active } = req.body;
        const { data, error } = await supabase
            .from('build_categories')
            .update({ name, icon, description, sort_order, is_active })
            .eq('id', categoryId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/build-categories/:id', isAdmin, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        await supabase.from('build_templates').delete().eq('category_id', categoryId);
        const { error } = await supabase.from('build_categories').delete().eq('id', categoryId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/build-templates', isAdmin, async (req, res) => {
    try {
        const { category_id, name, description, components, total_price, min_budget, max_budget } = req.body;
        const { data, error } = await supabase
            .from('build_templates')
            .insert([{
                category_id,
                name,
                description: description || '',
                components: components || {},
                total_price: total_price || 0,
                min_budget: min_budget || 0,
                max_budget: max_budget || 0
            }])
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/build-templates/:id', isAdmin, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const { name, description, components, total_price, min_budget, max_budget } = req.body;
        const { data, error } = await supabase
            .from('build_templates')
            .update({ name, description, components, total_price, min_budget, max_budget })
            .eq('id', templateId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/build-templates/:id', isAdmin, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const { error } = await supabase
            .from('build_templates')
            .delete()
            .eq('id', templateId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/cart', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.json([]);
        
        const { data, error } = await supabase
            .from('cart')
            .select('*')
            .eq('user_id', parseInt(userId))
            .order('added_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/cart', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.status(401).json({ error: 'User ID required' });
        
        const { item_type, item_id, item_data, price } = req.body;
        
        const itemIdStr = String(item_id);
        
        const { data: existing } = await supabase
            .from('cart')
            .select('id, quantity')
            .eq('user_id', parseInt(userId))
            .eq('item_type', item_type)
            .eq('item_id', itemIdStr)
            .maybeSingle();
        
        let result;
        if (existing) {
            result = await supabase
                .from('cart')
                .update({ quantity: existing.quantity + 1 })
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            result = await supabase
                .from('cart')
                .insert([{
                    user_id: parseInt(userId),
                    item_type,
                    item_id: itemIdStr,
                    item_data,
                    quantity: 1,
                    price
                }])
                .select()
                .single();
        }
        
        if (result.error) throw result.error;
        res.json(result.data);
    } catch (error) {
        console.error('Cart add error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/cart', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.json([]);
        
        const { data, error } = await supabase
            .from('cart')
            .select('*')
            .eq('user_id', parseInt(userId))
            .order('added_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/cart/:id', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const cartId = parseInt(req.params.id);
        const { quantity } = req.body;
        
        const { data, error } = await supabase
            .from('cart')
            .update({ quantity: Math.max(1, quantity) })
            .eq('id', cartId)
            .eq('user_id', parseInt(userId))
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/cart/:id', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const cartId = parseInt(req.params.id);
        
        const { error } = await supabase
            .from('cart')
            .delete()
            .eq('id', cartId)
            .eq('user_id', parseInt(userId));
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const { delivery_address, customer_name, customer_phone, items, total_price } = req.body;
        
        if (!userId) return res.status(401).json({ error: 'User ID required' });
        
        const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const { data, error } = await supabase
            .from('orders')
            .insert([{
                user_id: parseInt(userId),
                order_number: orderNumber,
                items: items,
                total_price: total_price,
                delivery_address: delivery_address,
                customer_name: customer_name,
                customer_phone: customer_phone,
                status: 'pending',
                created_at: new Date()
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        await supabase.from('cart').delete().eq('user_id', parseInt(userId));
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) return res.json([]);
        
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', parseInt(userId))
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function checkCPUCompatibility(cpu, motherboard) {
    if (!cpu || !motherboard) return { compatible: true, warnings: [] };
    
    const warnings = [];
    
    if (cpu.socket && motherboard.socket && cpu.socket !== motherboard.socket) {
        warnings.push(`⚠️ Сокет процессора (${cpu.socket}) не совместим с сокетом материнской платы (${motherboard.socket})`);
    }
    
    return { compatible: warnings.length === 0, warnings };
}

function checkRAMCompatibility(ram, motherboard) {
    if (!ram || !motherboard) return { compatible: true, warnings: [] };
    
    const warnings = [];
    
    if (ram.ram_type && motherboard.ram_type && ram.ram_type !== motherboard.ram_type) {
        warnings.push(`⚠️ Тип памяти RAM (${ram.ram_type}) не совместим с материнской платой (${motherboard.ram_type})`);
    }
    
    return { compatible: warnings.length === 0, warnings };
}

function checkBuildCompatibility(build) {
    const allWarnings = [];
    let isCompatible = true;
    
    const cpuCheck = checkCPUCompatibility(build.cpu, build.motherboard);
    if (!cpuCheck.compatible) {
        isCompatible = false;
        allWarnings.push(...cpuCheck.warnings);
    }
    
    const ramCheck = checkRAMCompatibility(build.ram, build.motherboard);
    if (!ramCheck.compatible) {
        isCompatible = false;
        allWarnings.push(...ramCheck.warnings);
    }
    
    if (build.psu && (build.cpu || build.gpu)) {
        let totalPower = (build.cpu?.tdp || 65) + (build.gpu?.power_wattage || 75) + 100;
        if (build.psu.power_wattage && totalPower > build.psu.power_wattage) {
            allWarnings.push(`⚠️ Блок питания (${build.psu.power_wattage}W) может не обеспечить достаточную мощность (требуется ~${totalPower}W)`);
        }
    }
    
    if (build.case && build.motherboard) {
        const caseFormFactor = build.case.form_factor || 'Mid-Tower';
        const mbFormFactor = build.motherboard.form_factor || 'ATX';
        
        if (mbFormFactor === 'ATX' && caseFormFactor === 'Micro-ATX') {
            allWarnings.push(`⚠️ Материнская плата (${mbFormFactor}) может не поместиться в корпус (${caseFormFactor})`);
        }
    }
    
    return { compatible: isCompatible, warnings: allWarnings };
}

app.post('/api/check-compatibility', async (req, res) => {
    try {
        const { build } = req.body;
        const result = checkBuildCompatibility(build);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/user/profile/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log('Getting profile for user:', userId);
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, email, is_admin, created_at')
            .eq('id', userId)
            .single();
        
        if (userError) {
            console.error('User error:', userError);
            throw userError;
        }
        
        let { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (!profile) {
            console.log('Creating default profile for user:', userId);
            const { data: newProfile, error: insertError } = await supabase
                .from('user_profiles')
                .insert([{
                    user_id: userId,
                    full_name: user.username,
                    birth_date: null,
                    gender: '',
                    phone: '',
                    address: '',
                    updated_at: new Date()
                }])
                .select()
                .single();
            
            if (insertError) {
                console.error('Insert error:', insertError);
            } else {
                profile = newProfile;
            }
        }
        
        res.json({ 
            ...user, 
            profile: profile || {
                full_name: '',
                birth_date: null,
                gender: '',
                phone: '',
                address: ''
            } 
        });
    } catch (error) {
        console.error('Error in get profile:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/user/profile', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const { full_name, birth_date, gender, phone, address } = req.body;
        
        console.log('Updating profile for user:', userId);
        console.log('Data:', { full_name, birth_date, gender, phone, address });
        
        const { data: existing, error: checkError } = await supabase
            .from('user_profiles')
            .select('user_id')
            .eq('user_id', parseInt(userId))
            .maybeSingle();
        
        let result;
        
        if (existing) {
            result = await supabase
                .from('user_profiles')
                .update({
                    full_name: full_name || null,
                    birth_date: birth_date || null,
                    gender: gender || null,
                    phone: phone || null,
                    address: address || null,
                    updated_at: new Date()
                })
                .eq('user_id', parseInt(userId))
                .select()
                .single();
        } else {
            result = await supabase
                .from('user_profiles')
                .insert([{
                    user_id: parseInt(userId),
                    full_name: full_name || null,
                    birth_date: birth_date || null,
                    gender: gender || null,
                    phone: phone || null,
                    address: address || null,
                    updated_at: new Date()
                }])
                .select()
                .single();
        }
        
        if (result.error) {
            console.error('Update error:', result.error);
            throw result.error;
        }
        
        console.log('Profile updated successfully');
        res.json(result.data);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/user/username', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        const { newUsername } = req.body;
        
        console.log('Changing username for user:', userId, 'to:', newUsername);
        
        const { data: existing, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('username', newUsername)
            .neq('id', parseInt(userId))
            .maybeSingle();
        
        if (existing) {
            return res.status(400).json({ error: 'Имя пользователя уже занято' });
        }
        
        const { data, error } = await supabase
            .from('users')
            .update({ username: newUsername })
            .eq('id', parseInt(userId))
            .select()
            .single();
        
        if (error) {
            console.error('Update username error:', error);
            throw error;
        }
        
        res.json({ success: true, username: newUsername });
    } catch (error) {
        console.error('Error changing username:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/user/account', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        console.log('Deleting account for user:', userId);
        
        await supabase
            .from('user_profiles')
            .delete()
            .eq('user_id', parseInt(userId));
        
        await supabase
            .from('builds')
            .delete()
            .eq('user_id', parseInt(userId));
        
        await supabase
            .from('component_reviews')
            .delete()
            .eq('user_id', parseInt(userId));
        
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', parseInt(userId));
        
        if (error) throw error;
        
        console.log('Account deleted successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/components/:id/reviews', async (req, res) => {
    try {
        const componentId = parseInt(req.params.id);
        
        const { data, error } = await supabase
            .from('component_reviews')
            .select('*')
            .eq('component_id', componentId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/components/:id/reviews', async (req, res) => {
    try {
        const componentId = parseInt(req.params.id);
        const userId = req.headers['user-id'];
        const { rating, comment } = req.body;
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: user } = await supabase
            .from('users')
            .select('username')
            .eq('id', parseInt(userId))
            .single();
        
        const { data, error } = await supabase
            .from('component_reviews')
            .insert([{
                component_id: componentId,
                user_id: parseInt(userId),
                username: user?.username || 'Аноним',
                rating: parseInt(rating),
                comment: comment
            }])
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/reviews/:id', async (req, res) => {
    try {
        const reviewId = parseInt(req.params.id);
        const userId = req.headers['user-id'];
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: review } = await supabase
            .from('component_reviews')
            .select('user_id')
            .eq('id', reviewId)
            .single();
        
        const { data: user } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', parseInt(userId))
            .single();
        
        if (review?.user_id !== parseInt(userId) && !user?.is_admin) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        const { error } = await supabase
            .from('component_reviews')
            .delete()
            .eq('id', reviewId);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
const avatarUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения разрешены'), false);
        }
    }
});

app.post('/api/user/avatar', (req, res) => {
    avatarUpload.single('avatar')(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: err.message });
        }
        
        try {
            const userId = req.headers['user-id'];
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }
            
            if (!req.file) {
                return res.status(400).json({ error: 'Файл не загружен' });
            }
            
            console.log('Получен файл:', req.file.originalname, 'Размер:', req.file.size);
            
            let processedBuffer = req.file.buffer;
            
            try {
                const sharp = require('sharp');
                processedBuffer = await sharp(req.file.buffer)
                    .resize(300, 300, {
                        fit: 'cover',
                        position: 'centre'
                    })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                console.log('Изображение обработано, новый размер:', processedBuffer.length);
            } catch (sharpError) {
                console.log('Sharp не установлен или ошибка:', sharpError.message);
            }
            
            const fileExt = '.jpg';
            const uniqueName = `avatar_${userId}_${Date.now()}${fileExt}`;
            const filePath = `avatars/${uniqueName}`;
            
            const { data, error } = await supabase.storage
                .from('avatars')
                .upload(filePath, processedBuffer, {
                    contentType: 'image/jpeg',
                    cacheControl: '3600',
                    upsert: true
                });
            
            if (error) {
                console.error('Storage upload error:', error);
                return res.status(500).json({ error: 'Ошибка загрузки в хранилище: ' + error.message });
            }
            
            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);
            
            console.log('Аватар загружен, URL:', urlData.publicUrl);
            
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ avatar_url: urlData.publicUrl, updated_at: new Date() })
                .eq('user_id', parseInt(userId));
            
            if (updateError) {
                console.error('Profile update error:', updateError);
                return res.status(500).json({ error: 'Ошибка обновления профиля' });
            }
            
            res.json({ success: true, avatar_url: urlData.publicUrl });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Ошибка загрузки аватара: ' + error.message });
        }
    });
});

app.delete('/api/user/avatar', async (req, res) => {
    try {
        const userId = req.headers['user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }
        
        const { data: profile, error: fetchError } = await supabase
            .from('user_profiles')
            .select('avatar_url')
            .eq('user_id', parseInt(userId))
            .single();
        
        if (fetchError) {
            console.error('Fetch error:', fetchError);
        }
        
        if (profile && profile.avatar_url) {
            const urlParts = profile.avatar_url.split('/');
            const filename = urlParts[urlParts.length - 1];
            const filePath = `avatars/${filename}`;
            
            console.log('Удаление файла:', filePath);
            
            const { error: deleteError } = await supabase.storage
                .from('avatars')
                .remove([filePath]);
            
            if (deleteError) {
                console.error('Delete error:', deleteError);
            }
        }
        
        await supabase
            .from('user_profiles')
            .update({ avatar_url: null, updated_at: new Date() })
            .eq('user_id', parseInt(userId));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});
function startServer(port) {
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n===================================`);
        console.log(`✅ Сервер успешно запущен!`);
        console.log(`===================================\n`);
        console.log(`📍 Локальный доступ: http://localhost:${port}`);
        console.log(`🌐 Доступ из сети: на порту ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ Порт ${port} занят, пробую порт ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('❌ Ошибка при запуске сервера:', err);
        }
    });
}

startServer(PORT);