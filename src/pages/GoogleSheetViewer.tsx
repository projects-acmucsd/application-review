import { useEffect, useState, useRef, useCallback } from 'react';
import { gapi } from 'gapi-script';
import { useSearchParams } from 'react-router-dom';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const SHEET_ID = '1lJSS8R-SuGULx3ATWucr9k7FgK_4gmr4E4gUwsUddAY';
const SHEET_NAME = "'Form Responses 1'";
const REFRESH_INTERVAL = 20000;

interface SheetRow {
  data: string[];
  index: number;
}

export default function GoogleSheetViewer() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<SheetRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<SheetRow[]>([]);
  const [currentRow, setCurrentRow] = useState<string[]>([]);
  const [, setUserName] = useState('');
  const [searchParams] = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [newData, setNewData] = useState<string[] | null>(null);
  const [, setIsLoading] = useState(true);
  const lastFetchedRow = useRef<SheetRow | null>(null);
  const [visibleSections, setVisibleSections] = useState({
    ai: true,
    design: true,
    hack: true,
    gameDev: true
  });

  // Initialize Google API
  useEffect(() => {
    gapi.load('client:auth2', async () => {
      await gapi.client.init({ clientId: CLIENT_ID, scope: SCOPES });
      const auth = gapi.auth2.getAuthInstance();
      setUserName(auth.currentUser.get().getBasicProfile().getName());
      fetchSheetData();
    });
  }, []);

  // Fetch entire sheet data
  const fetchSheetData = useCallback(async () => {
    setIsLoading(true);
    try {
      await gapi.client.load('sheets', 'v4');
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1:BH`,
      });

      const rows = res.result.values || [];
      if (!rows.length) return;

      setHeaders(rows[0]);
      const sheetRows = rows.slice(1).map((row: string[], index: number) => ({ data: row, index: index + 1 }));
      setAllRows(sheetRows);
    } catch (error) {
      console.error('Error loading sheet data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter rows and update currentRow
  useEffect(() => {
    if (!allRows.length) return;
    const nameFilter = searchParams.get('name')?.toLowerCase().trim();
    const pageParam = parseInt(searchParams.get('q') || '1', 10) - 1;

    const filtered = nameFilter
      ? allRows.filter(row => row.data[13]?.toLowerCase().trim() === nameFilter)
      : allRows;

    setFilteredRows(filtered);

    const row = filtered[pageParam];
    if (row) {
      if (!lastFetchedRow.current || lastFetchedRow.current.index !== row.index) {
        lastFetchedRow.current = row;
        setCurrentRow(row.data);
        const lastCol = headers.length - 1;
        setCommentText(row.data[lastCol] || '');
      }
    }
  }, [allRows, headers.length, searchParams]);

  // Auto-refresh with conflict detection
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await gapi.client.load('sheets', 'v4');
        const res = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A1:BH`,
        });

        const rows = res.result.values?.slice(1).map((row: string[], index: number) => ({ data: row, index: index + 1 })) || [];
        if (!rows.length) return;

        setAllRows(prev => {
          // Only update if there are changes
          const changed = rows.some((r: SheetRow, i: number) => JSON.stringify(r.data) !== JSON.stringify(prev[i]?.data));
          return changed ? rows : prev;
        });

        // Conflict detection for current row
        if (lastFetchedRow.current) {
          const updatedRow: SheetRow | undefined = rows.find((r: SheetRow) => r.index === lastFetchedRow.current!.index);
          if (updatedRow && JSON.stringify(updatedRow.data) !== JSON.stringify(lastFetchedRow.current.data)) {
            if (isEditing) {
              setNewData(updatedRow.data);
              setShowConflictWarning(true);
            } else {
              lastFetchedRow.current = updatedRow;
              setCurrentRow(updatedRow.data);
              setCommentText(updatedRow.data[headers.length - 1] || '');
            }
          }
        }
      } catch (err) {
        console.error('Auto-refresh error:', err);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [headers.length, isEditing]);

  const updateDataSmoothly = (newRow: string[]) => {
    lastFetchedRow.current = { data: newRow, index: lastFetchedRow.current?.index || 0 };
    setCurrentRow(newRow);
    setCommentText(newRow[headers.length - 1] || '');
  };

  const saveComment = async () => {
    if (!lastFetchedRow.current) return;
    const rowIndex = lastFetchedRow.current.index + 1;
    const colIndex = headers.length;
    const getColumnLetter = (index: number) => {
      let temp = index, letter = '';
      while (temp > 0) { letter = String.fromCharCode(65 + (temp - 1) % 26) + letter; temp = Math.floor((temp - 1) / 26); }
      return letter;
    };

    try {
      const colLetter = getColumnLetter(colIndex);
      const currentVal = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!${colLetter}${rowIndex}`,
      });
      const existingValue = currentVal.result.values?.[0]?.[0] || '';
      const currentAnswer = currentRow[colIndex - 1] || '';

      if (existingValue !== currentAnswer) {
        setNewData([...currentRow.slice(0, -1), existingValue]);
        setShowConflictWarning(true);
        return;
      }

      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!${colLetter}${rowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [[commentText]] },
      });

      const updated = [...currentRow];
      updated[colIndex - 1] = commentText;
      updateDataSmoothly(updated);
      setIsEditing(false);
    } catch (error) {
      console.error('Save comment error:', error);
      alert('Failed to save comment. Please try again.');
    }
  };

  // Section visibility & priorities
  const getSectionPriorities = () => {
    const priorities: { [key: string]: number } = {};
    currentRow.slice(13, 17).forEach((r, i) => {
      if (!r) return;
      const section = r.toLowerCase();
      if (['ai', 'hack', 'game dev', 'design'].includes(section)) {
        priorities[section === 'game dev' ? 'gameDev' : section] = i + 1;
      }
    });
    return priorities;
  };

  useEffect(() => {
    const priorities = getSectionPriorities();
    setVisibleSections({
      ai: priorities.ai !== undefined,
      design: priorities.design !== undefined,
      hack: priorities.hack !== undefined,
      gameDev: priorities.gameDev !== undefined,
    });
  }, [currentRow]);

  const getPriorityLabel = (section: string) => {
    const p = getSectionPriorities()[section];
    return p ? ` (#${p} Priority)` : '';
  };

  const linkifyText = (text: string) => {
    if (!text) return text;
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return text.split(urlPattern).map((part, idx) => part.match(urlPattern)
      ? <a key={idx} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">{part}</a>
      : part
    );
  };

  const scrollToComments = () => document.querySelector('.comments-section')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="p-4">
      {showConflictWarning && newData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">New Data Available</h3>
            <p className="text-gray-700 mb-4">New data has been detected while you were editing. Please copy your current comment before refreshing:</p>
            <div className="bg-gray-100 p-4 rounded mb-4"><pre className="whitespace-pre-wrap">{commentText}</pre></div>
            <div className="flex justify-end">
              <button onClick={() => { updateDataSmoothly(newData); setShowConflictWarning(false); setIsEditing(false); }} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">Refresh Data</button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            {currentRow[2] ? `Reviewing Applicant: ${currentRow[2]}` : 'Loading...'}
          </h1>
          <h1 className="text-md font-bold text-gray-800 mb-4">
            {currentRow[2] ? `${searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1} of ${filteredRows.length}` : ''}
          </h1>
          
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setVisibleSections(prev => ({ ...prev, ai: !prev.ai }))}
              className={`px-4 py-2 rounded-md transition-colors ${
                visibleSections.ai 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {visibleSections.ai ? `Hide AI${getPriorityLabel('ai')}` : 'Show AI'}
            </button>
            <button
              onClick={() => setVisibleSections(prev => ({ ...prev, design: !prev.design }))}
              className={`px-4 py-2 rounded-md transition-colors ${
                visibleSections.design 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {visibleSections.design ? `Hide Design${getPriorityLabel('design')}` : 'Show Design'}
            </button>
            <button
              onClick={() => setVisibleSections(prev => ({ ...prev, hack: !prev.hack }))}
              className={`px-4 py-2 rounded-md transition-colors ${
                visibleSections.hack 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {visibleSections.hack ? `Hide Hack${getPriorityLabel('hack')}` : 'Show Hack'}
            </button>
            <button
              onClick={() => setVisibleSections(prev => ({ ...prev, gameDev: !prev.gameDev }))}
              className={`px-4 py-2 rounded-md transition-colors ${
                visibleSections.gameDev 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {visibleSections.gameDev ? `Hide Game Dev${getPriorityLabel('gameDev')}` : 'Show Game Dev'}
            </button>
          </div>
          <div className="flex justify-end mb-4">
            <button
              onClick={scrollToComments}
              className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
            >
              Jump to Comments
            </button>
          </div>

          {!isEditing && (
            <div className="space-x-3">
              {(searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) > 1 && (
                <a 
                  href={`/review?q=${(searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) - 1}${searchParams.get('name') ? `&name=${searchParams.get('name')}` : ''}`}
                  className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors shadow-sm"
                >
                  ← Previous Response
                </a>
              )}
              {filteredRows.length > (searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) && (
                <a 
                  href={`/review?q=${(searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) + 1}${searchParams.get('name') ? `&name=${searchParams.get('name')}` : ''}`}
                  className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors shadow-sm"
                >
                  Next Response →
                </a>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="divide-y divide-gray-200">
            {/* General Questions */}
            <div className="bg-gray-50 p-4">
              <h2 className="text-xl font-bold text-gray-900">General Questions</h2>
            </div>
            {headers.slice(0, 17).map((question, i) => (
              <div key={i} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{question}</h3>
                </div>
                <div className="text-gray-700 whitespace-pre-wrap">
                  {currentRow[i] ? linkifyText(currentRow[i]) : (
                    <span className="text-gray-400 italic">No answer provided</span>
                  )}
                </div>
              </div>
            ))}

            {/* AI Questions */}
            {visibleSections.ai && (
              <>
                <div className="bg-gray-50 p-4">
                  <h2 className="text-xl font-bold text-gray-900">AI Questions</h2>
                </div>
                {headers.slice(17, 25).map((question, i) => (
                  <div key={i + 17} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{question}</h3>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap">
                      {currentRow[i + 17] ? linkifyText(currentRow[i + 17]) : (
                        <span className="text-gray-400 italic">No answer provided</span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Design Questions */}
            {visibleSections.design && (
              <>
                <div className="bg-gray-50 p-4">
                  <h2 className="text-xl font-bold text-gray-900">Design Questions</h2>
                </div>
                {headers.slice(25, 34).map((question, i) => (
                  <div key={i + 25} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{question}</h3>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap">
                      {currentRow[i + 25] ? linkifyText(currentRow[i + 25]) : (
                        <span className="text-gray-400 italic">No answer provided</span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Hack Questions */}
            {visibleSections.hack && (
              <>
                <div className="bg-gray-50 p-4">
                  <h2 className="text-xl font-bold text-gray-900">Hack Questions</h2>
                </div>
                {headers.slice(34, 47).map((question, i) => (
                  <div key={i + 34} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{question}</h3>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap">
                      {currentRow[i + 34] ? linkifyText(currentRow[i + 34]) : (
                        <span className="text-gray-400 italic">No answer provided</span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Game Dev Questions */}
            {visibleSections.gameDev && (
              <>
                <div className="bg-gray-50 p-4">
                  <h2 className="text-xl font-bold text-gray-900">Game Dev Questions</h2>
                </div>
                {headers.slice(47, 53).map((question, i) => (
                  <div key={i + 47} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{question}</h3>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap">
                      {currentRow[i + 47] ? linkifyText(currentRow[i + 47]) : (
                        <span className="text-gray-400 italic">No answer provided</span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Other Questions */}
            <div className="bg-gray-50 p-4">
              <h2 className="text-xl font-bold text-gray-900">Other Questions</h2>
            </div>
            {headers.slice(53, 57).map((question, i) => (
              <div key={i + 53} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{question}</h3>
                </div>
                <div className="text-gray-700 whitespace-pre-wrap">
                  {currentRow[i + 53] ? linkifyText(currentRow[i + 53]) : (
                    <span className="text-gray-400 italic">No answer provided</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 bg-gray-100 rounded-lg shadow-lg overflow-hidden comments-section">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Reviewer Comments</h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors shadow-sm"
                >
                  Edit Comment
                </button>
              ) : (
                <div className="space-x-2">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      const lastColumnIndex = headers.length - 1;
                      setCommentText(currentRow[lastColumnIndex] || '');
                    }}
                    className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveComment}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors shadow-sm"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
            {isEditing ? (
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full h-32 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your review comments here..."
              />
            ) : (
              <div className="text-gray-700 whitespace-pre-wrap">
                {currentRow[headers.length - 1] || (
                  <span className="text-gray-400 italic">No comments yet</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-x-3">
          {!isEditing && (
            <>
              {(searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) > 1 && (
                <a 
                  href={`/review?q=${(searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) - 1}${searchParams.get('name') ? `&name=${searchParams.get('name')}` : ''}`}
                  className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors shadow-sm"
                >
                  ← Previous Response
                </a>
              )}
              {filteredRows.length > (searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) && (
                <a 
                  href={`/review?q=${(searchParams.get('q') ? parseInt(searchParams.get('q')!) : 1) + 1}${searchParams.get('name') ? `&name=${searchParams.get('name')}` : ''}`}
                  className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors shadow-sm"
                >
                  Next Response →
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
