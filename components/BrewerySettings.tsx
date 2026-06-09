import React, { useState, useEffect } from 'react';
import { useUser } from '../services/userContext';
import { useTranslation } from '../App';
import { breweryService } from '../services/breweryService';
import { Brewery, Invitation, BreweryRole } from '../types';

const BrewerySettings: React.FC = () => {
  const { profile, user, breweryRole } = useUser();
  const { t } = useTranslation();
  const [brewery, setBrewery] = useState<Brewery | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState<BreweryRole>('brewmaster');

  const isAdmin = breweryRole === 'admin';

  useEffect(() => {
    if (profile?.brewery_id) {
      loadData();
    }
  }, [profile?.brewery_id]);

  const loadData = async () => {
    if (!profile?.brewery_id) return;
    setLoading(true);
    try {
      const b = await breweryService.getBrewery(profile.brewery_id);
      setBrewery(b);
      if (b) setNewName(b.name);

      const m = await breweryService.getMembers(profile.brewery_id);
      setMembers(m);

      if (isAdmin) {
        const i = await breweryService.getInvitations(profile.brewery_id);
        setInvitations(i);
      }
    } catch (err) {
      console.error('Error loading brewery data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!brewery || !newName.trim()) return;
    try {
      await breweryService.updateBrewery(brewery.id, newName);
      setBrewery({ ...brewery, name: newName });
      alert('Brewery name updated!');
    } catch (err) {
      alert('Failed to update brewery name');
    }
  };

  const handleCreateInvite = async () => {
    if (!profile?.brewery_id) return;
    try {
      const invite = await breweryService.generateInvitation(profile.brewery_id, inviteRole);
      if (invite) {
        setInvitations([...invitations, invite]);
        setShowInviteModal(false);
      }
    } catch (err) {
      alert('Failed to create invitation');
    }
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      await breweryService.deleteInvitation(id);
      setInvitations(invitations.filter(i => i.id !== id));
    } catch (err) {
      alert('Failed to delete invitation');
    }
  };

  if (loading) return <div className="py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs animate-pulse">Loading Brewery...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 p-3 rounded-2xl text-white shadow-lg">
              <i className="fas fa-beer-mug-empty text-2xl"></i>
            </div>
            <div>
              <h3 className="text-2xl font-black text-stone-900">{brewery?.name || 'Brewery'}</h3>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
                Role: <span className="text-amber-600">{breweryRole}</span>
              </p>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="space-y-4 pt-4 border-t border-stone-100">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Brewery Name</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold focus:ring-2 focus:ring-amber-500/20 outline-none"
              />
              <button
                onClick={handleUpdateName}
                className="px-6 py-3 bg-stone-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Members List */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
              <i className="fas fa-users"></i>
            </div>
            <h4 className="text-lg font-black text-stone-900">Team Members</h4>
          </div>
          <div className="space-y-3">
            {members.map(member => (
              <div key={member.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center text-stone-500">
                    <i className="fas fa-user text-xs"></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-900 truncate max-w-[150px]">
                      {member.id === profile?.id ? 'You' : member.id.substring(0, 8) + '...'}
                    </p>
                    <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{member.brewery_role}</p>
                  </div>
                </div>
                {isAdmin && member.id !== profile?.id && (
                  <button className="text-stone-300 hover:text-red-500 transition-colors">
                    <i className="fas fa-user-minus"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Invitations */}
        {isAdmin && (
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-xl text-green-600">
                  <i className="fas fa-envelope-open-text"></i>
                </div>
                <h4 className="text-lg font-black text-stone-900">Active Invites</h4>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="w-8 h-8 bg-stone-900 text-white rounded-lg flex items-center justify-center hover:bg-black transition-all"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
            <div className="space-y-3">
              {invitations.length === 0 && (
                <p className="text-center py-8 text-xs text-stone-400 font-bold italic">No active invitations</p>
              )}
              {invitations.map(invite => (
                <div key={invite.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Role: {invite.role}</span>
                    <button onClick={() => handleDeleteInvite(invite.id)} className="text-stone-300 hover:text-red-500 transition-colors text-xs">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-stone-200">
                    <code className="text-sm font-black text-amber-600">{invite.code}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(invite.code); alert('Code copied!'); }}
                      className="text-[10px] font-black uppercase text-stone-400 hover:text-stone-900"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-stone-900 mb-6">Create Invitation</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-stone-400 uppercase mb-2 ml-1">Assign Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['brewmaster', 'brewer', 'taster'] as BreweryRole[]).map(role => (
                    <button
                      key={role}
                      onClick={() => setInviteRole(role)}
                      className={`p-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${inviteRole === role ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-white border-stone-100 text-stone-400'}`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInvite}
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-stone-200"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrewerySettings;
