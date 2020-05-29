regex_date = %r{^\d{4}\-(0?[1-9]|1[012])\-(0?[1-9]|[12][0-9]|3[01])$}

PHOTOS_DIR = '../assets/photos'
PHOTOS_POSTS_DIR = '../_posts'
PHOTOS_EXT = '.jpg'
POSTS_EXT = '.md'

Dir.foreach(PHOTOS_DIR) do |filename|
  next if filename == '.' or filename == '..'

  name = filename.chomp(PHOTOS_EXT)
  corrected_name = name.gsub ' ','_'
  date = filename[0..9]

  post_filename = name+POSTS_EXT
  if ! regex_date.match date
    date = '2000-01-01'
    post_filename = date+'-'+corrected_name+POSTS_EXT
  end

  puts File.join(PHOTOS_DIR,filename), corrected_name, date
  puts post_filename

  File.open(post_filename,'w') do |pf|
    pf.puts '---'
    pf.puts 'layout: photo'
    pf.puts 'title: '+corrected_name
    pf.puts 'photo: /assets/photos/'+filename
    pf.puts 'categories: Photos'
    pf.puts '---'
    pf.puts
    pf.puts 'No description.'
  end
  
 end
