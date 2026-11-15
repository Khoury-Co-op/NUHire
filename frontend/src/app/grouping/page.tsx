'use client';
import NavbarAdmin from '../components/navbar-admin';
import Tabs from '../components/tabs';
import { StudentCSVTab } from '../components/StudentCSVTab';
import { ManageGroupsTab } from '../components/ManageGroupsTab';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';

const Grouping = () => {
  const { user, loading: userloading } = useAuth();

  if (userloading) {
    return <PageLoader />;
  }

  if (!user || user.affiliation !== 'admin') {
    return <div>This account is not authorized for this page</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-sand font-rubik">
      <NavbarAdmin />
      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        <Tabs>
          <div title="Manage Groups">
            <div className="w-full max-h-[calc(100vh-200px)] overflow-y-auto border-4 border-northeasternBlack rounded-lg">
              <ManageGroupsTab />
            </div>
          </div>

          <div title="CSV Group Assignment">
            <div className="w-full max-h-[calc(100vh-200px)] overflow-y-auto border-4 border-northeasternBlack rounded-lg">
              <StudentCSVTab />
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default Grouping;
