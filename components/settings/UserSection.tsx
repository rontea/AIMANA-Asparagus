import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, X, Edit2, ShieldCheck, UserMinus, UserCheck } from 'lucide-react';
import { StoredUser } from '../../types';
import { api } from '../../services/api';
import { useModalDialogs } from '../../hooks/useModalDialogs';

export const UserSection: React.FC = () => {
    const { confirm, alert, confirmDialog, alertDialog } = useModalDialogs();
    const [users, setUsers] = useState<StoredUser[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [userForm, setUserForm] = useState({ 
        name: '', 
        email: '', 
        password: '', 
        role: 'user' as 'admin' | 'user', 
        provider: 'email' as 'email' | 'google',
        isBlocked: false
    });
    const [userMsg, setUserMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        try {
            const list = await api.admin.listUsers();
            setUsers(list);
        } catch (e) {}
    };

    const openAddModal = () => {
        setEditingUserId(null);
        setUserForm({ name: '', email: '', password: '', role: 'user', provider: 'email', isBlocked: false });
        setUserMsg(null);
        setShowModal(true);
    };

    const openEditModal = (user: StoredUser) => {
        setEditingUserId(user.id);
        setUserForm({ 
            name: user.name, 
            email: user.email, 
            password: '', // Password not editable via this route
            role: user.role, 
            provider: user.provider || 'email',
            isBlocked: !!user.isBlocked
        });
        setUserMsg(null);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserMsg(null);
        try {
            if (editingUserId) {
                await api.admin.updateUser({ 
                    id: editingUserId, 
                    name: userForm.name, 
                    role: userForm.role, 
                    isBlocked: userForm.isBlocked 
                });
                setUserMsg({ type: 'success', text: 'User updated successfully' });
            } else {
                await api.admin.addUser(userForm);
                setUserMsg({ type: 'success', text: 'User created successfully' });
            }
            
            setTimeout(() => {
                setShowModal(false);
                loadUsers();
            }, 1000);
        } catch (err: any) { 
            setUserMsg({ type: 'error', text: err.message || 'Operation failed' }); 
        }
    };

    const handleDeleteUser = async (id: string) => {
        const ok = await confirm({
            title: 'Delete User',
            description: 'Delete this user? This action is irreversible.',
            confirmLabel: 'Delete User',
            tone: 'danger'
        });
        if (!ok) return;
        try { 
            await api.admin.deleteUser(id); 
            loadUsers(); 
        } catch (err: any) { 
            await alert({
                title: 'Delete Failed',
                description: err.message || 'Unable to delete the user.',
                tone: 'danger'
            });
        }
    };

    const toggleBlockStatus = async (user: StoredUser) => {
        try {
            await api.admin.updateUser({ 
                id: user.id, 
                name: user.name, 
                role: user.role, 
                isBlocked: !user.isBlocked 
            });
            loadUsers();
        } catch (err: any) {
            await alert({
                title: 'Update Failed',
                description: err.message || 'Unable to update user status.',
                tone: 'danger'
            });
        }
    };

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Users size={20} className="text-indigo-400"/> User Management
                </h2>
                <button onClick={openAddModal} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95">
                    <Plus size={16}/> Add New User
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] font-bold">
                        <tr>
                            <th className="p-4">Name & Email</th>
                            <th className="p-4">Role</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {users.map(u => (
                            <tr key={u.id} className={`hover:bg-slate-700/20 transition-colors ${u.isBlocked ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                                <td className="p-4">
                                    <div className="font-medium text-white">{u.name}</div>
                                    <div className="text-xs text-slate-500">{u.email}</div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${u.role === 'admin' ? 'bg-red-900/30 text-red-400 border-red-500/20' : 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                                        {u.role.toUpperCase()}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {u.isBlocked ? (
                                        <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                                            <UserMinus size={14} /> Blocked
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                                            <UserCheck size={14} /> Active
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-1">
                                        <button 
                                            onClick={() => openEditModal(u)} 
                                            className="text-slate-400 hover:text-indigo-400 transition-colors p-2"
                                            title="Edit User"
                                        >
                                            <Edit2 size={16}/>
                                        </button>
                                        {u.id !== 'admin-root' && (
                                            <>
                                                <button 
                                                    onClick={() => toggleBlockStatus(u)} 
                                                    className={`p-2 transition-colors ${u.isBlocked ? 'text-emerald-500 hover:text-emerald-400' : 'text-amber-500 hover:text-amber-400'}`}
                                                    title={u.isBlocked ? "Unblock User" : "Block User"}
                                                >
                                                    <ShieldCheck size={16}/>
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteUser(u.id)} 
                                                    className="text-slate-500 hover:text-red-400 transition-colors p-2"
                                                    title="Delete User"
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {editingUserId ? <Edit2 size={18} className="text-indigo-400"/> : <Plus size={18} className="text-indigo-400"/>}
                                {editingUserId ? 'Edit User Settings' : 'Register New User'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Full Name</label>
                                <input value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" required />
                            </div>
                            
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Email Address</label>
                                <input 
                                    type="email" 
                                    value={userForm.email} 
                                    onChange={e => setUserForm({...userForm, email: e.target.value})} 
                                    className={`w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all ${editingUserId ? 'opacity-50 cursor-not-allowed' : ''}`} 
                                    required 
                                    readOnly={!!editingUserId}
                                />
                                {editingUserId && <p className="text-[10px] text-slate-500 mt-1 italic">Email cannot be changed after registration.</p>}
                            </div>

                            {!editingUserId && userForm.provider === 'email' && (
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Initial Password</label>
                                    <input type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" required />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Access Level</label>
                                    <select 
                                        value={userForm.role} 
                                        onChange={e => setUserForm({...userForm, role: e.target.value as 'admin'|'user'})} 
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                                        disabled={editingUserId === 'admin-root'}
                                    >
                                        <option value="user">Standard User</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                                {!editingUserId ? (
                                    <div>
                                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Auth Provider</label>
                                        <select value={userForm.provider} onChange={e => setUserForm({...userForm, provider: e.target.value as 'email'|'google'})} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50">
                                            <option value="email">Email / Pass</option>
                                            <option value="google">Google SSO</option>
                                        </select>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Status Control</label>
                                        <select 
                                            value={userForm.isBlocked ? "blocked" : "active"} 
                                            onChange={e => setUserForm({...userForm, isBlocked: e.target.value === "blocked"})} 
                                            className={`w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 ${userForm.isBlocked ? 'text-red-400' : 'text-emerald-400'}`}
                                            disabled={editingUserId === 'admin-root'}
                                        >
                                            <option value="active">Active</option>
                                            <option value="blocked">Blocked</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {userMsg && (
                                <div className={`p-3 rounded-lg text-xs font-bold animate-in slide-in-from-top-1 ${userMsg.type === 'error' ? 'bg-red-900/20 text-red-400 border border-red-900/30' : 'bg-green-900/20 text-green-400 border border-green-900/30'}`}>
                                    {userMsg.text}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-sm font-medium px-4">Cancel</button>
                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all active:scale-95">
                                    {editingUserId ? 'Save Changes' : 'Register User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmDialog}
            {alertDialog}
        </section>
    );
};
